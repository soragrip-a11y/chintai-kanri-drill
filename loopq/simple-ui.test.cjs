const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,image,q,record}=require('./test-support.cjs');
// Photo capture, photo deletion/undo and manual creation controls were retired.
// Legacy photo records must remain readable and unchanged in the simplified UI.
test('legacy photos and question history survive library and detail rendering',()=>{
 const r=structuredClone(record),before=structuredClone(r),{api,frames}=app([r]);
 api.library();api.detail(r.id);assert.deepEqual(api.getRecords(),[before]);
 assert.doesNotMatch(frames.at(-1),/photo-files|save-source|manual-statement|delete-photo|restore-photo/);
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
