const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,record}=require('./test-support.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
function row(id='set',n=3){return {...structuredClone(record),id,title:'セット '+id,questions:Array.from({length:n},(_,i)=>({...structuredClone(record.questions[0]),id:id+'-q'+i,statement:'問題 '+i,answer:i%2===0}))}}
function setup(){const r=row(),e=app([r]);e.api.setQuiz({pool:r.questions.map(q=>({setId:r.id,qid:q.id})),index:0,picked:null,sessionCorrect:0});e.api.quizPage();return e}
function ready(e){e.api.getQuiz().readyAt=0}
const attempts=e=>e.api.getRecords().flatMap(r=>r.questions).reduce((n,q)=>n+q.attempts,0);
test('home and reload resume the exact pool, answered explanation and counters',async()=>{
 const e=setup(),initial=attempts(e),pool=plain(e.api.getQuiz().pool);await e.api.answer(false);e.api.navigate('home');assert.match(e.frames.at(-1),/続きから解く/);assert.match(e.frames.at(-1),/1 \/ 3問 解答済み/);
 const id=e.api.getSessions()[0].id;await e.api.resumeQuiz(id);assert.equal(e.api.getQuiz().picked,false);assert.match(e.frames.at(-1),/あなたの回答：×/);await e.api.answer(true);assert.equal(attempts(e),initial+1);
 const reload=app(plain(e.api.getRecords()));reload.api.setSessions(plain(e.api.getSessions()));reload.api.navigate('home');await reload.api.resumeQuiz(id);assert.deepEqual(plain(reload.api.getQuiz().pool),pool);assert.equal(reload.api.getQuiz().picked,false);assert.equal(attempts(reload),initial+1);
});
test('previous reviews saved yes/no results without regrading; next returns to unanswered position',async()=>{
 for(const value of [true,false]){const e=setup(),initial=attempts(e);await e.api.answer(value);await e.get('next').onclick();ready(e);assert.equal(e.api.getQuiz().index,1);await e.get('previous').onclick();ready(e);assert.equal(e.api.getQuiz().index,0);assert.equal(e.api.getQuiz().picked,value);await e.api.answer(!value);assert.equal(attempts(e),initial+1);await e.get('next').onclick();assert.equal(e.api.getQuiz().index,1);assert.equal(e.api.getQuiz().picked,null)}
});
test('next exists only once at right after previous and remains below both answer choices',async()=>{
 for(const value of [true,false]){const e=setup();for(const done of [false,true]){if(done)await e.api.answer(value);const html=e.frames.at(-1);assert.equal((html.match(/id="next"/g)||[]).length,1);assert.ok(html.indexOf('id="ans-false"')<html.indexOf('id="previous"'));assert.ok(html.indexOf('id="previous"')<html.indexOf('id="next"'));assert.match(html,/thumb-dock quiz-dock/);assert.equal(/id="next" class="btn primary" disabled/.test(html),!done)}}
});
test('double answer/next and stale DOM event handlers cannot skip or count twice',async()=>{
 const e=setup(),initial=attempts(e);const answer=e.get('ans-true').onclick;await Promise.all([answer(),answer()]);assert.equal(attempts(e),initial+1);const next=e.get('next').onclick;await Promise.all([next(),next()]);assert.equal(e.api.getQuiz().index,1);ready(e);await answer();assert.equal(attempts(e),initial+1);
});
test('late answer after Home saves once without dragging the user back into the quiz',async()=>{
 let release;const e=setup(),initial=attempts(e);e.api.setCommitQuizAnswer(async(s,value)=>{await new Promise(r=>release=r);const r=e.api.getRecords()[0],q=r.questions[0];return {record:{...r,questions:r.questions.map((x,i)=>i?x:{...x,attempts:x.attempts+1})},session:{...s,answers:s.answers.map((x,i)=>i?x:{picked:value,correct:true,answeredAt:new Date().toISOString()})}}});const pending=e.api.answer(true);e.api.navigate('home');release();await pending;assert.equal(e.context.location.hash,'#home');assert.equal(attempts(e),initial+1);assert.match(e.frames.at(-1),/1 \/ 3問 解答済み/);
});
test('separate sets, mixed sets, global and weak modes retain independent checkpoints',async()=>{
 const rs=[row('a',2),row('b',2)],e=app(rs);for(const [sets,weak,mode] of [[[rs[0]],false,'sets'],[[rs[1]],false,'sets'],[rs,false,'sets'],[rs,false,'all'],[rs,true,'weak']]){await e.api.startQuiz(sets,weak,mode);await e.api.answer(false);e.api.navigate('home')}
 assert.equal(e.api.getSessions().length,5);assert.ok(e.api.getSessions().every(s=>s.answers.filter(Boolean).length===1));const saved=e.api.getSessions().find(s=>s.id==='all');await e.api.resumeQuiz(saved.id);assert.equal(e.api.getQuiz().picked,false);
});
test('finishing clears only that checkpoint and leaves all historical attempts intact',async()=>{
 const e=setup(),initial=attempts(e);for(let i=0;i<3;i++){ready(e);await e.api.answer(true);await e.get('next').onclick()}assert.equal(e.context.location.hash,'#home');assert.equal(e.api.getQuiz(),null);assert.equal(e.api.getSessions().length,0);assert.equal(attempts(e),initial+3);e.api.navigate('quiz');assert.equal(e.context.location.hash,'#review');
});
test('explicit restart clears answers only, creates new token and preserves history and originals',async()=>{
 const e=setup();await e.api.answer(false);const before=plain(e.api.getRecords()),token=e.api.getQuiz().token;await e.api.startQuiz(e.api.getRecords(),false,'sets',true);assert.notEqual(e.api.getQuiz().token,token);assert.ok(e.api.getQuiz().answers.every(x=>x===null));assert.deepEqual(plain(e.api.getRecords()),before);
});
test('failed start, position write and finish are visible and retryable without losing saved state',async()=>{
 const r=row(),e=app([r]);e.api.setSaveQuiz(async()=>{throw Error('QuotaExceededError')});await e.api.startQuiz([r]);assert.equal(e.api.getQuiz(),null);assert.match(e.get('toast').textContent,/開始できません/);
 const q=setup();await q.api.answer(true);q.api.setSaveQuiz(async()=>{throw Error('QuotaExceededError')});await q.get('next').onclick();assert.equal(q.api.getQuiz().index,0);assert.equal(q.api.getQuiz().picked,true);assert.match(q.get('toast').textContent,/移動を保存できません/);
 q.api.setDeleteQuiz(async()=>{throw Error('QuotaExceededError')});await q.api.results();assert.equal(q.api.getSessions().length,1);assert.equal(q.api.getQuiz().picked,true);q.api.setDeleteQuiz(async()=>{});await q.api.results();assert.equal(q.api.getSessions().length,0);
});
test('unknown/deleted/changed questions are omitted without touching unrelated history',async()=>{
 const e=setup();await e.api.answer(true);const initial=attempts(e),id=e.api.getQuiz().id;e.api.navigate('home');const rs=e.api.getRecords();e.api.setRecords([{...rs[0],questions:[rs[0].questions[0],{...rs[0].questions[1],answer:null},{...rs[0].questions[2],statement:'更新された問題'}]}]);await e.api.resumeQuiz(id);assert.equal(e.api.getQuiz().pool.length,1);assert.equal(e.api.getQuiz().picked,true);assert.equal(attempts(e),initial);
});
test('stale fully deleted global checkpoint is replaced and new questions can be started',async()=>{
 const a=row('a'),b=row('b'),e=app([a]);await e.api.startQuiz([a],false,'all');const token=e.api.getQuiz().token;e.api.navigate('home');e.api.setRecords([b]);await e.api.startQuiz([b],false,'all');assert.notEqual(e.api.getQuiz().token,token);assert.ok(e.api.getQuiz().pool.every(x=>x.setId==='b'));
});
test('late start and resume do not override navigation while storage is pending',async()=>{
 const r=row(),e=app([r]);let release;e.api.setSaveQuiz(async s=>{await new Promise(r=>release=r);return s});const starting=e.api.startQuiz([r]);while(!release)await Promise.resolve();e.api.navigate('library');release();await starting;assert.equal(e.context.location.hash,'#library');assert.equal(e.api.getSessions().length,1);
 const resuming=e.api.resumeQuiz(e.api.getSessions()[0].id);release=null;while(!release)await Promise.resolve();e.api.navigate('home');release();await resuming;assert.equal(e.context.location.hash,'#home');
});
test('source cards and details label saved per-set progress without photo/manual controls',async()=>{
 const e=setup();await e.api.answer(true);e.api.navigate('library');assert.match(e.frames.at(-1),/続きから（1 \/ 3問）/);e.api.navigate('detail','set');assert.match(e.frames.at(-1),/続きから（1 \/ 3問）/);assert.doesNotMatch(e.frames.at(-1),/photo-files|manual-statement|save-source/);
});
