const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,record}=require('./test-support.cjs');require('./backup.js');
const q={statement:'  原文の改行\nと「引用」 <img src=x onerror=alert(1)>  ',answer:false,explanation:'元の解説\nそのまま。',reference:'元の出典'};
const parse=questions=>LoopQOriginal.parse(JSON.stringify({questions}));
const make=questions=>LoopQOriginal.records(parse(questions),'試験','2026-10-14T00:00:00Z');
test('original importer preserves strings and accepts arbitrary counts while generated importer remains exactly three',async()=>{
 for(const n of [1,8,168,1000]){const qs=Array.from({length:n},(_,i)=>({...q,originalId:String(i+1)})),parsed=parse(qs);assert.equal(parsed.questions.length,n);assert.equal(parsed.questions[0].statement,q.statement);assert.equal(parsed.questions[0].explanation,q.explanation);const rs=await make(qs);assert.equal(rs.flatMap(r=>r.questions).length,n);assert.ok(rs.every(r=>r.questions.length<=100));assert.equal(LoopQSafety.validateBackup({format:'loopq.v2',records:rs}).length,rs.length)}
 assert.throws(()=>parse([]));assert.throws(()=>parse(Array(1001).fill(q)));
 assert.throws(()=>LoopQPastedJSON.parse(JSON.stringify({questions:Array(8).fill(q)})),/厳密に3問/);
});
test('topic groups retain question IDs, provenance and explicit source answers',async()=>{
 const parsed=LoopQOriginal.parse(JSON.stringify({format:'loopq.original.v1',title:'教材',sourceFile:'教材.pdf',sourceSha256:'a'.repeat(64),notice:'転記、未検証',questions:[{...q,originalId:'01-1',topic:'分野1',sourcePage:2,answerPage:23},{...q,originalId:'02-1',topic:'分野2',answer:true}]}));
 const rs=await LoopQOriginal.records(parsed,'資格');assert.equal(rs.length,2);assert.equal(rs[0].title,'分野1');assert.equal(rs[0].questions[0].answer,false);assert.equal(rs[1].questions[0].answer,true);assert.equal(rs[0].questions[0].sourcePage,2);assert.equal(rs[0].original.sourceFile,'教材.pdf');assert.equal(rs[0].status,'review_required');
 const restored=[];for(const part of LoopQBackup.parts(rs))restored.push(...LoopQSafety.validateBackup(JSON.parse(await part.text())));assert.equal(restored[0].questions[0].originalId,'01-1');assert.equal(restored[0].questions[0].answerPage,23);assert.deepEqual(restored[0].original,rs[0].original);
});
test('deterministic content IDs block repeated imports without trusting supplied source hash',async()=>{
 const a=await make([q]),b=await make([q]);assert.equal(a[0].id,b[0].id);const changed=await make([{...q,statement:'別の原文'}]);assert.notEqual(a[0].id,changed[0].id);
 const env=app(a);env.context.LoopQSafety={...LoopQSafety,validateBackup:raw=>LoopQSafety.validateBackup(JSON.parse(JSON.stringify(raw)))};await assert.rejects(env.api.persistOriginal(b),/取り込み済み/);assert.equal(env.api.getRecords()[0].questions[0].attempts,0);
});
test('unknown answers remain null and cannot enter graded quizzes or acquire grading history',async()=>{
 const rs=await make([{...q,answer:null,explanation:''},{statement:'正答なし'}]);assert.ok(rs[0].questions.every(q=>q.answer===null));assert.equal(LoopQSafety.validateBackup({format:'loopq.v2',records:rs})[0].questions[0].answer,null);
 const env=app(rs);env.api.startQuiz(rs);assert.equal(env.api.getQuiz(),null);assert.equal(env.api.getStats().playable,0);
 env.api.setQuiz({pool:[{setId:rs[0].id,qid:rs[0].questions[0].id}],index:0,picked:null,sessionCorrect:0});await env.api.answer(false);assert.equal(env.api.getRecords()[0].questions[0].attempts,0);
 assert.throws(()=>LoopQSafety.validateBackup({format:'loopq.v2',records:[{...rs[0],questions:[{...rs[0].questions[0],attempts:1}]}]}),/正答未確認/);
 const legacy={...record,questions:[{...record.questions[0],answer:null}]};assert.throws(()=>LoopQSafety.validateBackup({format:'loopq.v2',records:[legacy]}),/正解形式/);
});
test('malformed imports reject rather than guessing answers, truncating text or ignoring unsupported question types',()=>{
 for(const value of ['false',0,1,[],{}])assert.throws(()=>parse([{...q,answer:value}]),/answer/);
 for(const item of [{...q,statement:'s'.repeat(2501)},{...q,explanation:'x'.repeat(5001)},{...q,sourcePage:0},{...q,answerPage:1.5},{...q,choices:['A','B']},{...q,originalId:7}])assert.throws(()=>parse([item]));
 assert.throws(()=>parse([{...q,originalId:'x'},{...q,originalId:'x'}]),/重複/);
 assert.throws(()=>LoopQOriginal.parse('{"questions":[],"questions":[]}'),/重複/);
 assert.throws(()=>LoopQOriginal.parse(JSON.stringify({format:'loopq.original.v99',questions:[q]})),/バージョン/);
 assert.throws(()=>LoopQOriginal.parse('x'.repeat(1000001)),/上限/);
});
test('preview uses textContent, and file/paste import keeps invalid content and old history safe',async()=>{
 const env=app([record]);env.api.originalImport();env.get('original-text').value=JSON.stringify({questions:[q]});env.get('original-text').input();assert.match(env.get('original-preview').children[1].textContent,/<img/);assert.equal(env.get('original-preview').children[1].innerHTML,undefined);
 let called=0;env.api.setOriginalPersist(async()=>called++);env.get('original-exam').value='資格';env.get('original-text').value='broken';await env.get('original-save').onclick();assert.equal(called,0);assert.match(env.get('original-feedback').textContent,/保存できません/);assert.deepEqual(env.api.getRecords(),[record]);
});
test('save groups questions and starts existing quiz, double-click is ignored, failed saves retain input for retry',async()=>{
 let finish,entered;const started=new Promise(resolve=>entered=resolve);const env=app([record]);env.api.originalImport();const source=JSON.stringify({questions:[q,{...q,answer:true}]});env.get('original-text').value=source;env.get('original-exam').value='資格';let writes=0;
 env.api.setOriginalPersist(async rows=>{writes++;entered();await new Promise(resolve=>finish=resolve);env.api.setRecords([record,...rows]);return rows});const save=env.get('original-save').onclick();await started;await env.get('original-save').onclick();assert.equal(writes,1);finish();await save;assert.equal(env.api.getQuiz().pool.length,2);assert.deepEqual(env.api.getRecords()[0],record);
 const fail=app([record]);fail.api.originalImport();fail.get('original-text').value=source;fail.get('original-exam').value='資格';fail.api.setOriginalPersist(async()=>{throw Error('QuotaExceededError')});await fail.get('original-save').onclick();assert.equal(fail.get('original-text').value,source);assert.equal(fail.get('original-save').disabled,false);assert.match(fail.get('original-feedback').textContent,/Quota/);assert.deepEqual(fail.api.getRecords(),[record]);
});
test('late file read cannot replace a newer paste or oversized input',async()=>{
 const env=app();env.api.originalImport();let finish;env.get('original-file').files=[{size:10,text:()=>new Promise(r=>finish=r)}];const read=env.get('original-file').onchange();env.get('original-text').value='new paste';env.get('original-text').input();finish(JSON.stringify({questions:[q]}));await read;assert.equal(env.get('original-text').value,'new paste');env.get('original-file').files=[{size:3000001,text:()=>{throw Error('should not read')}}];await env.get('original-file').onchange();assert.match(env.get('original-feedback').textContent,/3MB/);
});
test('selecting a new file blocks saving stale pasted data until the current read succeeds',async()=>{
 const env=app();env.api.originalImport();env.get('original-exam').value='資格';env.get('original-text').value=JSON.stringify({questions:[q]});env.get('original-text').input();let finish,writes=0;env.api.setOriginalPersist(async rows=>{writes++;return rows});env.get('original-file').files=[{size:1,text:()=>new Promise(r=>finish=r)}];const loading=env.get('original-file').onchange();assert.equal(env.get('original-save').disabled,true);await env.get('original-save').onclick();assert.equal(writes,0);finish(JSON.stringify({questions:[{...q,statement:'新しいファイル'}]}));await loading;assert.equal(env.get('original-save').disabled,false);await env.get('original-save').onclick();assert.equal(writes,1);
});
test('failed file selection cannot save previous pasted data until it is explicitly edited',async()=>{
 const env=app();env.api.originalImport();env.get('original-exam').value='資格';env.get('original-text').value=JSON.stringify({questions:[q]});env.get('original-text').input();let writes=0;env.api.setOriginalPersist(async rows=>{writes++;return rows});env.get('original-file').files=[{size:1,text:async()=>'broken'}];await env.get('original-file').onchange();assert.equal(env.get('original-save').disabled,true);await env.get('original-save').onclick();assert.equal(writes,0);env.get('original-text').input();assert.equal(env.get('original-save').disabled,false);
});
