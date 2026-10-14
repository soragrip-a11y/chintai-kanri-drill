const {test}=require('node:test'),assert=require('node:assert/strict');
require('./safety.js');require('./pasted-json.js');require('./batch.js');const B=globalThis.LoopQBatch;
const q={statement:'条件付きの設問',answer:false,explanation:'理由',reference:'未確認',trap:'例外'},questions=[q,q,q],batch={sets:[{sourceId:'a',questions},{sourceId:'b',questions}]};
const record=(id)=>({id,exam:'資格',title:id,topic:'保持するメモ',image:null,questions:[],createdAt:'2026-10-14T00:00:00Z',status:'saved',weak:true,extra:'保持する属性'});
test('batch parser preserves meaning and binds by ID, not response order',()=>{
 for(const value of [JSON.stringify(batch),'```json\n'+JSON.stringify(batch)+'\n```',JSON.stringify(JSON.stringify(batch))]){const result=B.parse(value,['b','a']);assert.equal(result.sets[0].sourceId,'b');assert.deepEqual(result.sets[0].questions,questions)}
 assert.equal(B.parse(JSON.stringify({questions}),['a']).sets[0].sourceId,'a');
});
test('reject missing/duplicate/unknown IDs, extra questions, ambiguous and malformed data',()=>{
 for(const bad of [{sets:[batch.sets[0]]},{sets:[batch.sets[0],batch.sets[0]]},{sets:[batch.sets[0],{sourceId:'unknown',questions}]},{sets:[batch.sets[0],{sourceId:'b',questions:[q,q]}]},{...batch,extra:1},{questions}])assert.throws(()=>B.parse(JSON.stringify(bad),['a','b']));
 assert.throws(()=>B.parse(JSON.stringify(batch)+JSON.stringify(batch),['a','b']));assert.throws(()=>B.parse(JSON.stringify(batch).replace('"sourceId":"a"','"sourceId":"a","sourceId":"b"'),['a','b']));assert.throws(()=>B.parse('x'.repeat(150001),['a','b']));
});
// In-memory IDB transaction double: queued requests and rollback of staged writes.
function database(initial,failPutAt=0){
 const data=new Map(initial.map(r=>[r.id,structuredClone(r)]));
 return {data,transaction(){const staged=new Map(data),jobs=[];let writes=0,aborted=false;const tx={error:null,abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(){return {get(id){const req={};jobs.push(()=>{req.result=staged.get(id);req.onsuccess?.()});return req},add(row){if(staged.has(row.id))throw Error('duplicate');this.put(row)},put(row){if(++writes===failPutAt)throw Error('QuotaExceededError');staged.set(row.id,structuredClone(row))}}}};queueMicrotask(()=>{for(const job of jobs){if(aborted)break;job()}if(!aborted){data.clear();for(const pair of staged)data.set(...pair);tx.oncomplete?.()}});return tx}};
}
const withQuestions=id=>({id,questions:questions.map((q,i)=>({...q,id:id+'q'+i,attempts:0,correct:0,weak:false}))});
test('atomic commit binds three questions per photo and preserves existing metadata',async()=>{
 const db=database([record('a'),record('b')]);const saved=await B.commit(db,'sources',[withQuestions('a'),withQuestions('b')],'questions');assert.equal(saved.length,2);for(const r of db.data.values()){assert.equal(r.questions.length,3);assert.equal(r.topic,'保持するメモ');assert.equal(r.extra,'保持する属性');assert.equal(r.weak,true);assert.equal(r.status,'review_required')}
});
test('second write failure rolls back first; retry succeeds',async()=>{
 const before=[record('a'),record('b')],db=database(before,2);await assert.rejects(B.commit(db,'sources',[withQuestions('a'),withQuestions('b')],'questions'),/Quota/);assert.deepEqual([...db.data.values()],before);const retry=database([...db.data.values()]);await B.commit(retry,'sources',[withQuestions('a'),withQuestions('b')],'questions');assert.equal(retry.data.get('a').questions.length,3);
});
test('stale view, deleted photo, invalid question all abort every write',async()=>{
 for(const state of [[record('a'),{...record('b'),questions:[{attempts:7}]}],[record('a')],[record('a'),record('b')]]){const db=database(state),before=structuredClone([...db.data.values()]),rows=[withQuestions('a'),withQuestions('b')];if(state.length===2&&!state[1].questions.length)rows[1].questions[0].answer='false';await assert.rejects(B.commit(db,'sources',rows,'questions'));assert.deepEqual([...db.data.values()],before)}
});
test('new photo batch is all or nothing and never replaces an existing ID',async()=>{
 const db=database([record('b')]);await assert.rejects(B.commit(db,'sources',[record('a'),record('b')],'new'));assert.equal(db.data.has('a'),false);const full=database([]);await B.commit(full,'sources',[record('a'),record('b')],'new');assert.equal(full.data.size,2);
});
test('valid JSON with another batch IDs is rejected with both IDs, distinct from duplicates',()=>{
 const text=JSON.stringify(batch);assert.throws(()=>B.parse(text,['new-a','new-b']),e=>e.message.includes('保存先：new-a / new-b')&&e.message.includes('回答：a / b'));
 assert.throws(()=>B.parse(JSON.stringify({sets:[batch.sets[0],batch.sets[0]]}),['a','b']),/同じ写真IDが重複/);
 assert.deepEqual(B.parse('<escape>'+text+'</escape>',['a','b']).sets,batch.sets);
});
test('single sourceId/questions alias preserves meaning across raw, fences and JSON string layers',()=>{
 const item={...q,statement:'条件A："引用符"、smart “quotes”、文字列内の\\(数式風\\) と \\[配列風\\] は維持',explanation:'改行\nとバックスラッシュ\\もそのまま'},alias={sourceId:'photo-a',questions:[item,{...item,answer:true},item]},text=JSON.stringify(alias),before=structuredClone(alias);
 for(const input of [text,'```json\n'+text+'\n```','前置き\n'+text+'\n後書き',JSON.stringify(text),JSON.stringify(JSON.stringify(text))]){
  assert.deepEqual(B.parse(input,['photo-a']).sets,[alias]);
 }
 assert.deepEqual(alias,before);
 for(const old of [{questions:alias.questions},{sets:[alias]}])assert.deepEqual(B.parse(JSON.stringify(old),['photo-a']).sets,[alias]);
});
test('single alias validates its own ID without dropping or replacing it',()=>{
 assert.throws(()=>B.parse(JSON.stringify({sourceId:'old-photo',questions}),['current-photo']),e=>e.message.includes('保存先：current-photo')&&e.message.includes('回答：old-photo')&&e.message.includes('自動変更していません'));
 for(const sourceId of ['',null,12,{},['a'],'space id'])assert.throws(()=>B.parse(JSON.stringify({sourceId,questions}),['a']),/sourceIdは写真ID/);
 for(const value of [{sourceId:'a',questions,extra:1},{sourceId:'a',questions,status:'complete'},{sourceId:'a',questions,message:'done'},{sourceId:'a'},null,[],{questions,other:'x'},{sets:batch.sets,status:'done'}]){
  assert.throws(()=>B.parse(JSON.stringify(value),['a']),/JSONの形式が違います/);
 }
});
test('single alias never fills a multiple-photo request and keeps strict question validation',()=>{
 assert.throws(()=>B.parse(JSON.stringify({sourceId:'a',questions}),['a','b']),/写真1枚分.*対象は2枚.*写真ごとに3問.*① 指示文をコピー/);
 for(const items of [[q,q],[q,q,q,q],[{...q,answer:'false'},q,q],[{...q,statement:'s'.repeat(2501)},q,q],[{...q,explanation:42},q,q]]){
  assert.throws(()=>B.parse(JSON.stringify({sourceId:'a',questions:items}),['a']));
 }
 const text=JSON.stringify({sourceId:'a',questions});
 assert.throws(()=>B.parse(text.replace('"sourceId":"a"','"sourceId":"a","sourceId":"b"'),['a']),/同じキーが重複/);
 assert.throws(()=>B.parse(text.replace('"answer":false','"answer":false,"answer":true'),['a']),/同じキーが重複/);
 assert.throws(()=>B.parse(text+'\n'+text,['a']),/JSONが複数/);
});
test('unfinished status responses get the same actionable guidance raw or fenced without trusting their text',()=>{
 const unfinished={status:'確認中',sourceId:'a',message:'<img src=x onerror=alert(1)> 問題はできています'},text=JSON.stringify(unfinished),expected='完成した問題が含まれていません。「確認中」などの途中の返信は保存できません。対象は1枚です。写真ごとに3問ずつ含む回答全体を貼り付けてください。この画面の「① 指示文をコピー」から作成し直せます';
 for(const input of [text,'```json\n'+text+'\n```',JSON.stringify(text),'前置き'+text+'後書き']){
  assert.throws(()=>B.parse(input,['a']),e=>e.message===expected);
 }
 for(const value of [{...unfinished,status:'complete'},{...unfinished,status:null},{status:{questions},sourceId:'a'}])assert.throws(()=>B.parse(JSON.stringify(value),['a']),e=>e.message===expected);
 assert.throws(()=>B.parse('```json\n'+text+'\n```',['a','b']),/完成した問題.*対象は2枚.*写真ごとに3問/);
 assert.throws(()=>B.parse(text+'\n'+JSON.stringify({sourceId:'a',questions}),['a']),/JSONが複数/);
 assert.throws(()=>B.parse('```json\n'+JSON.stringify({sourceId:'a',questions,status:'done'})+'\n```',['a']),/JSONの形式が違います/);
});
