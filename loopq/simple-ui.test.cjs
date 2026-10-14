const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,image,q,record}=require('./test-support.cjs');
test('capture removes title/topic and saves once then opens handoff directly',async()=>{
 const saved=[],{api,get,frames,context}=app([],async r=>saved.push(r));api.capture();
 assert.match(frames.at(-1),/元問題を追加/);assert.doesNotMatch(frames.at(-1),/source-title|source-topic|次の武器|どうやって/);
 await get('save-source').onclick();assert.equal(saved.length,0);
 api.setPhoto(image);get('exam').value='その他';await get('save-source').onclick();assert.equal(saved.length,0);
 get('custom-exam').value='独自資格';await get('save-source').onclick();assert.equal(saved.length,1);assert.equal(saved[0].exam,'独自資格');assert.equal(saved[0].image,image);assert.equal(saved[0].topic,'');assert.match(frames.at(-1),/batch-flow/);assert.equal(context.location.hash,'#detail/'+saved[0].id);
});
test('photo-only delete and undo preserve complete question history and metadata',async()=>{
 const r=structuredClone(record),{api}=app([r]);await api.changePhoto('set');const deleted=api.getRecords()[0];assert.equal(deleted.image,null);assert.deepEqual(JSON.parse(JSON.stringify(deleted.questions)),r.questions);assert.equal(deleted.topic,r.topic);assert.equal(deleted.title,r.title);assert.equal(api.getUndo().get('set'),image);
 await api.changePhoto('set',true);assert.equal(api.getRecords()[0].image,image);assert.equal(api.getUndo().size,0);
});
test('failed photo delete does not mutate stored or undo state',async()=>{
 const r=structuredClone(record),{api}=app([r],async()=>{throw Error('quota')});await api.changePhoto('set');assert.equal(api.getRecords()[0].image,image);assert.equal(api.getUndo().size,0);
});
test('library paginates and escapes untrusted titles',()=>{
 const rs=Array.from({length:5},(_,i)=>({...record,id:'s'+i,title:'<img src=x> '+i})),{api,get,frames}=app(rs);api.library();assert.equal((frames.at(-1).match(/<article/g)||[]).length,2);assert.match(frames.at(-1),/&lt;img/);assert.match(frames.at(-1),/1 \/ 3/);get('page-next').onclick();assert.match(frames.at(-1),/2 \/ 3/);get('page-next').onclick();assert.equal((frames.at(-1).match(/<article/g)||[]).length,1);
});
test('correct/wrong result is separate from selected and correct answer',()=>{
 for(const [picked,label,klass] of [[true,'正解','result-correct'],[false,'不正解','result-wrong']]){const {api,frames}=app([record]);api.setQuiz({pool:[{setId:'set',qid:'q'}],index:0,picked,sessionCorrect:0});api.quizPage();const html=frames.at(-1);assert.match(html,new RegExp(klass+'" role="status">'+label));assert.match(html,new RegExp('あなたの回答：'+(picked?'○':'×')));assert.match(html,/正しい答え：○/);assert.doesNotMatch(html,/× 不正解|正答：/)}
});
test('failed answer persistence keeps history and permits retry',async()=>{
 let fail=true;const original=structuredClone(record),{api}=app([original],async()=>{if(fail)throw Error('quota')});api.setQuiz({pool:[{setId:'set',qid:'q'}],index:0,picked:null,sessionCorrect:0});api.quizPage();await api.answer(true);assert.equal(api.getRecords()[0].questions[0].attempts,5);assert.equal(api.getQuiz().picked,null);fail=false;await api.answer(true);assert.equal(api.getRecords()[0].questions[0].attempts,6);assert.equal(api.getRecords()[0].questions[0].correct,3);assert.equal(api.getQuiz().sessionCorrect,1);await api.answer(true);assert.equal(api.getRecords()[0].questions[0].attempts,6);
});
