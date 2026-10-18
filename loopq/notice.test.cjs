const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,record}=require('./test-support.cjs');
const q={statement:'具体的な条件の設問',answer:false,explanation:'理由',reference:'未確認',trap:'例外'},text=JSON.stringify({questions:[q,q,q]});
test('initial notice requires one explicit check, persists, and is skipped on later launches',()=>{
 const {api,get,frames,storage}=app([],async()=>{},{exam:'独自資格',pendingSourceIds:['set']});api.render();assert.match(frames.at(-1),/はじめに1回だけ確認/);get('initial-notice-accept').onclick();assert.equal(api.getSettings().aiUseNoticeVersion,undefined);get('initial-notice-check').checked=true;get('initial-notice-accept').onclick();assert.equal(get('crumb').textContent,'ホーム');assert.doesNotMatch(frames.at(-1),/initial-notice-check/);const saved=JSON.parse(storage.get('loopq-settings-v2'));assert.equal(saved.aiUseNoticeVersion,1);assert.equal(saved.exam,'独自資格');assert.deepEqual(saved.pendingSourceIds,['set']);const next=app([],async()=>{},saved);next.api.render();assert.doesNotMatch(next.frames.at(-1),/initial-notice-check/);
});
// The old photo/batch handoff has been removed. Exercise its safety invariants
// through the sole remaining JSON-to-study importer instead.
function importer(settings={aiUseNoticeVersion:1}){
 let writes=0;const env=app([structuredClone(record)],async()=>{},settings);env.api.originalImport();env.get('original-exam').value='資格';
 env.api.setOriginalPersist(async rows=>{writes++;env.api.setRecords([...env.api.getRecords(),...rows]);return rows});
 return {...env,writes:()=>writes};
}
test('save reparses current textarea even if the browser did not emit an input event',async()=>{
 const env=importer();env.get('original-text').value=text;assert.equal(env.get('original-save').disabled,false);await env.get('original-save').onclick();assert.equal(env.writes(),1);assert.equal(env.api.getQuiz().pool.length,3);
});
test('empty or malformed answer has actionable feedback and leaves all history untouched',async()=>{
 const env=importer(),before=JSON.stringify(env.api.getRecords());for(const value of ['',text.slice(0,-1)]){env.get('original-text').value=value;await env.get('original-save').onclick();assert.equal(env.writes(),0);assert.match(env.get('original-feedback').textContent,/保存できません/);assert.equal(env.get('original-save').disabled,false);assert.equal(JSON.stringify(env.api.getRecords()),before)}
});
test('initial acknowledgment survives input edits but never bypasses JSON validation',async()=>{
 const env=importer();env.get('original-text').value='invalid';env.get('original-text').input();assert.equal(env.api.getSettings().aiUseNoticeVersion,1);await env.get('original-save').onclick();assert.equal(env.writes(),0);env.get('original-text').value=text;env.get('original-text').change();await env.get('original-save').onclick();assert.equal(env.writes(),1);assert.equal(env.api.getSettings().aiUseNoticeVersion,1);assert.deepEqual(env.api.getRecords()[0],record);
});
test('direct JSON save cannot bypass the initial notice before acceptance',async()=>{
 const env=importer({});env.get('original-text').value=text;await env.get('original-save').onclick();assert.equal(env.writes(),0);assert.match(env.frames.at(-1),/initial-notice-check/);
});
