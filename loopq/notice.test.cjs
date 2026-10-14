const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,record}=require('./test-support.cjs');
const q={statement:'具体的な条件の設問',answer:false,explanation:'理由',reference:'未確認',trap:'例外'},text=JSON.stringify({questions:[q,q,q]});
test('initial notice requires one explicit check, persists, and is skipped on later launches',()=>{
 const {api,get,frames,storage}=app([],async()=>{},{exam:'独自資格',pendingSourceIds:['set']});api.render();assert.match(frames.at(-1),/はじめに1回だけ確認/);get('initial-notice-accept').onclick();assert.equal(api.getSettings().aiUseNoticeVersion,undefined);get('initial-notice-check').checked=true;get('initial-notice-accept').onclick();assert.match(frames.at(-1),/ホーム/);assert.doesNotMatch(frames.at(-1),/initial-notice-check/);const saved=JSON.parse(storage.get('loopq-settings-v2'));assert.equal(saved.aiUseNoticeVersion,1);assert.equal(saved.exam,'独自資格');assert.deepEqual(saved.pendingSourceIds,['set']);const next=app([],async()=>{},saved);next.api.render();assert.doesNotMatch(next.frames.at(-1),/initial-notice-check/);
});
test('save reparses current textarea even if the browser did not emit an input event',async()=>{
 let writes=0;const rs=[{...record,questions:[]}],{api,get}=app(rs,async()=>writes++);api.renderBatchHandoff(rs);get('generated-json').value=text;assert.equal(get('accept-json').disabled,false);await get('accept-json').onclick();assert.equal(writes,1);assert.equal(api.getQuiz().pool.length,3);
});
test('empty or malformed answer has actionable feedback, never a disabled mystery button',async()=>{
 let writes=0;const rs=[{...record,questions:[]}],{api,get}=app(rs,async()=>writes++);api.renderBatchHandoff(rs);for(const value of ['',text.slice(0,-1)]){get('generated-json').value=value;await get('accept-json').onclick();assert.equal(writes,0);assert.match(get('handoff-feedback').textContent,/貼り付け/);assert.equal(get('accept-json').disabled,false)}
});
test('initial acknowledgment remains valid across input edits but never bypasses JSON or history checks',async()=>{
 let writes=0;const rs=[{...record,questions:[]}],{api,get}=app(rs,async()=>writes++);api.renderBatchHandoff(rs);get('generated-json').value='invalid';get('generated-json').input();assert.equal(api.getSettings().aiUseNoticeVersion,1);await get('accept-json').onclick();assert.equal(writes,0);get('generated-json').value=text;get('generated-json').change();await get('accept-json').onclick();assert.equal(writes,1);assert.equal(api.getSettings().aiUseNoticeVersion,1);
});
test('direct save cannot bypass the initial notice before acceptance',async()=>{
 let writes=0;const rs=[{...record,questions:[]}],{api,get,frames}=app(rs,async()=>writes++,{});api.renderBatchHandoff(rs);get('generated-json').value=text;await get('accept-json').onclick();assert.equal(writes,0);assert.match(frames.at(-1),/initial-notice-check/);
});
test('manual ChatGPT path is always visible independently of share support; file picker appends images',async()=>{
 const rs=[{...record,questions:[]}],{api,get,frames}=app(rs);api.renderBatchHandoff(rs);const html=frames.at(-1);assert.match(html,/<div id="batch-fallback"/);assert.match(html,/写真まとめを保存/);assert.match(html,/href="https:\/\/chatgpt.com\/"/);assert.match(html,/端末の共有を使う（任意）/);api.capture();assert.match(frames.at(-1),/id="photo-files"[^>]*multiple/);api.setImageProcessor(async()=>'data:image/jpeg;base64,YQ==');const input=get('photo-files');input.files=[{},{}];await input.change({target:input});assert.equal(api.getDraft().length,2);
});
