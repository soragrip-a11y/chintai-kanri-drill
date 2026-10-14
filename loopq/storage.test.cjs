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
 for(const [file,prefix,current] of [['../sw.js','chintai-drill-','chintai-drill-2026-v3'],['sw.js','loopq-','loopq-v15-storage-20261014']]){
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
