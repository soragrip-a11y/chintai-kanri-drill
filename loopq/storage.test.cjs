const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('./safety.js');require('./backup.js');require('./pasted-json.js');
const row={id:'source',exam:'test',title:'test',image:null,createdAt:'2026-10-14T00:00:00Z',questions:[],status:'saved'};
test('backup parts round trip, including UTF-8 bytes and record limits',async()=>{
 const rows=Array.from({length:7},(_,i)=>({...row,id:'s'+i,title:'写真'.repeat(30)}));
 const parts=LoopQBackup.parts(rows,1000,2),restored=[];
 assert.ok(parts.length>1);
 for(const part of parts){assert.ok(part.size<=1000);const data=JSON.parse(await part.text());assert.ok(data.records.length<=2);restored.push(...LoopQSafety.validateBackup(data))}
 assert.deepEqual(restored.map(r=>r.id),rows.map(r=>r.id));
 assert.equal(LoopQBackup.parts([]).length,1);
 assert.throws(()=>LoopQBackup.parts(rows,10));
 assert.throws(()=>LoopQBackup.parts([{...row,image:'javascript:alert(1)'}]));
});
test('maximum imported question lengths survive backup validation',()=>{
 const q={statement:'s'.repeat(2500),explanation:'e'.repeat(5000),reference:'r'.repeat(1500),trap:'t'.repeat(1500),answer:true};
 // Three maximum records exceed the clipboard total limit, so check field boundaries individually.
 for(const field of ['statement','explanation','reference','trap']){
  const item={statement:'s',explanation:'e',reference:'r',trap:'t',answer:true,[field]:q[field]};
  const parsed=LoopQPastedJSON.parse(JSON.stringify({questions:[item,item,item]}));
  assert.equal(LoopQSafety.validateBackup({format:'loopq.v2',records:[{...row,questions:parsed.questions.map((q,i)=>({...q,id:'q'+i}))}]})[0].questions[0][field],item[field]);
 }
});
test('restore retains final answer timestamp and rejects malformed timestamps',()=>{
 const q={id:'q',statement:'s',explanation:'e',answer:true,lastAnsweredAt:'2026-10-14T12:34:56Z'};
 assert.equal(LoopQSafety.validateBackup({format:'loopq.v2',records:[{...row,questions:[q]}]})[0].questions[0].lastAnsweredAt,q.lastAnsweredAt);
 assert.throws(()=>LoopQSafety.validateBackup({format:'loopq.v2',records:[{...row,questions:[{...q,lastAnsweredAt:'bad'}]}]}));
});
test('100, 1000 and 10001 metadata records export into restorable parts',async()=>{
 for(const count of [100,1000,10001]){
  const parts=LoopQBackup.parts(Array.from({length:count},(_,i)=>({...row,id:'s'+i})));let n=0;
  for(const part of parts){assert.ok(part.size<=LoopQBackup.MAX_BYTES);n+=LoopQSafety.validateBackup(JSON.parse(await part.text())).length}
  assert.equal(n,count);
 }
});
test('both service workers remove only their own obsolete caches',async()=>{
 for(const [file,prefix,current] of [['../sw.js','chintai-drill-','chintai-drill-2026-v3'],['sw.js','loopq-','loopq-v20-original-import-20261014']]){
  const events={},deleted=[];let pending;
  vm.runInNewContext(fs.readFileSync(__dirname+'/'+file,'utf8'),{self:{addEventListener:(n,f)=>events[n]=f,clients:{claim(){} }},caches:{keys:async()=>[current,prefix+'old','other-app','loopq-unrelated-test'],delete:async k=>deleted.push(k)}});
  events.activate({waitUntil:p=>pending=p});await pending;
  assert.ok(deleted.includes(prefix+'old'));assert.ok(!deleted.includes(current));assert.ok(!deleted.includes('other-app'));
  if(prefix==='chintai-drill-')assert.ok(!deleted.includes('loopq-unrelated-test'));
 }
});
test('real persist commits without reading the full library; abort leaves memory unchanged',async()=>{
 let src=fs.readFileSync(__dirname+'/app.js','utf8');src=src.slice(0,src.indexOf("window.addEventListener('hashchange'"))+`globalThis.api={persist,tx,setup:(d,r)=>{db=d;records=r},records:()=>records};})();`;
 const context=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},console});vm.runInContext(src,context);
 let fail=false,allReads=0;
 const db={transaction(){const t={objectStore:()=>({put(){queueMicrotask(()=>fail?t.onabort():t.oncomplete())},getAll(){allReads++;throw Error('unexpected full read')}}),abort(){queueMicrotask(()=>t.onabort())}};return t}};
 context.api.setup(db,[row]);await context.api.persist({...row,title:'changed'});assert.equal(context.api.records()[0].title,'changed');assert.equal(allReads,0);
 fail=true;await assert.rejects(context.api.persist({...row,title:'lost'}));assert.equal(context.api.records()[0].title,'changed');
});

const {app,record:photoRecord,q:question}=require('./test-support.cjs');
const answerTime='2026-10-14T12:00:00.000Z';
class FixedDate extends Date{
 constructor(...args){super(...(args.length?args:[answerTime]))}
 static now(){return Date.parse(answerTime)}
}
function quizWithHistory(q){
 const original={...structuredClone(photoRecord),questions:[q]},writes=[],runtime=app([original],async record=>writes.push(record));
 runtime.context.Date=FixedDate;
 runtime.api.setQuiz({pool:[{setId:original.id,qid:q.id}],index:0,picked:null,sessionCorrect:0});
 runtime.api.quizPage();
 return {...runtime,original,writes};
}
async function backupRoundTrip(records){
 // The actual answer handler returns VM objects. Exercise the JSON boundary used by export/import.
 const plainRecords=JSON.parse(JSON.stringify(records)),restored=[];
 for(const part of LoopQBackup.parts(plainRecords))restored.push(...LoopQSafety.validateBackup(JSON.parse(await part.text())));
 return restored;
}
test('fourth distinct-day correct answer survives real answer, backup and restore with photo metadata',async()=>{
 const seed={...question,attempts:3,correct:3,successDays:3,lastSuccessDay:'2026-10-13',mastered:true,weak:false};
 const runtime=quizWithHistory(seed),before=structuredClone(runtime.original);
 await runtime.api.answer(true);
 assert.equal(runtime.writes.length,1);
 const saved=runtime.api.getRecords()[0],q=saved.questions[0];
 assert.equal(q.successDays,4);assert.equal(q.attempts,4);assert.equal(q.correct,4);assert.equal(q.mastered,true);
 assert.equal(q.lastSuccessDay,'2026-10-14');assert.equal(q.lastAnsweredAt,answerTime);
 const [restored]=await backupRoundTrip(runtime.api.getRecords());
 assert.deepEqual(restored.questions[0],JSON.parse(JSON.stringify(q)));
 for(const field of ['id','exam','title','topic','image','createdAt','status','weak'])assert.equal(restored[field],before[field]);
 assert.deepEqual(runtime.original,before);
});
test('existing successDays above three and the history counter boundary restore without clamping or mutation',async()=>{
 for(const successDays of [4,10,10_000_000]){
  const original={...structuredClone(photoRecord),questions:[{...question,attempts:successDays,correct:successDays,successDays,lastSuccessDay:'2026-10-13',mastered:true,weak:false}]},before=structuredClone(original);
  const [restored]=await backupRoundTrip([original]);
  assert.equal(restored.questions[0].successDays,successDays);
  assert.equal(restored.questions[0].attempts,successDays);assert.equal(restored.questions[0].correct,successDays);
  assert.equal(restored.questions[0].mastered,true);assert.equal(restored.image,original.image);
  assert.deepEqual(original,before);
 }
});
test('invalid successDays still reject backup and restore without altering source records',()=>{
 for(const successDays of [-1,0.5,'4',Number.MAX_SAFE_INTEGER+1,10_000_001]){
  const original={...structuredClone(photoRecord),questions:[{...question,attempts:10,correct:10,successDays}]},before=structuredClone(original);
  assert.throws(()=>LoopQSafety.validateBackup({format:'loopq.v2',records:[original]}),/学習回数/);
  assert.throws(()=>LoopQBackup.parts([original]),/学習回数/);
  assert.deepEqual(original,before);
 }
});
test('actual answer keeps same-day success count and resets it only on an incorrect answer',async()=>{
 const seed={...question,attempts:4,correct:4,successDays:4,lastSuccessDay:'2026-10-14',mastered:true,weak:false};
 const correct=quizWithHistory({...seed});await correct.api.answer(true);
 const sameDay=correct.api.getRecords()[0].questions[0];
 assert.equal(sameDay.successDays,4);assert.equal(sameDay.attempts,5);assert.equal(sameDay.correct,5);
 assert.equal(sameDay.mastered,true);assert.equal(sameDay.lastSuccessDay,'2026-10-14');
 assert.equal((await backupRoundTrip(correct.api.getRecords()))[0].questions[0].successDays,4);
 const wrong=quizWithHistory({...seed});await wrong.api.answer(false);
 const reset=wrong.api.getRecords()[0].questions[0];
 assert.equal(reset.successDays,0);assert.equal(reset.attempts,5);assert.equal(reset.correct,4);
 assert.equal(reset.mastered,false);assert.equal(reset.weak,true);assert.equal(reset.lastSuccessDay,'');
 assert.equal((await backupRoundTrip(wrong.api.getRecords()))[0].questions[0].successDays,0);
});

