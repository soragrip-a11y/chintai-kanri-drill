const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {app,record}=require('./test-support.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('handoff shows ordered separate controls and removes combined clipboard code',async()=>{
 const env=app([{...record,questions:[]}]);env.api.renderBatchHandoff([{...record,questions:[]}]);await tick();
 const html=env.frames.at(-1);assert.doesNotMatch(html,/copy-image-prompt|画像＋指示文/);assert.match(html,/① 指示文をコピー/);assert.match(html,/② 写真まとめを保存/);assert.match(html,/③ ChatGPTを開く/);assert.equal(env.get('export-batch').disabled,false);
 const code=fs.readFileSync(__dirname+'/app.js','utf8');assert.doesNotMatch(code,/ClipboardItem|clipboardPNG|clipboard\.write\(/);
});
test('copy writes the exact prompt and guides the user to save the photo',async()=>{
 const env=app([{...record,questions:[]}]);let copied;env.context.navigator.clipboard={writeText:async text=>copied=text};env.api.renderBatchHandoff([{...record,questions:[]}]);await env.get('copy-prompt').onclick();
 assert.equal(copied,env.api.batchPrompt([{...record,questions:[]}]));assert.match(env.get('share-feedback').textContent,/次に「②/);
});
test('copy denial opens the actual manual-copy details without a success claim',async()=>{
 const env=app([{...record,questions:[]}]);env.context.navigator.clipboard={writeText:async()=>{throw Error('denied')}};env.api.renderBatchHandoff([{...record,questions:[]}]);await env.get('copy-prompt').onclick();
 assert.equal(env.get('prompt-details').hidden,false);assert.match(env.get('share-feedback').textContent,/手動でコピー/);assert.doesNotMatch(env.get('share-feedback').textContent,/コピーしました/);
});
test('single and batch prompts require one valid JSON code block with exact IDs',()=>{
 const {api}=app();for(const sources of [[record],[record,{...record,id:'second'}]]){
  const prompt=api.batchPrompt(sources);assert.match(prompt,/1つのjsonコードブロック/);assert.match(prompt,/JSON.parse/);assert.match(prompt,/バックスラッシュでエスケープしない/);assert.doesNotMatch(prompt,/Markdownや前後文は付けない/);for(const r of sources)assert.ok(prompt.includes(r.id));
 }
});
test('explicit instruction toggle reveals full text and closes without losing it',()=>{
 const env=app();env.api.renderBatchHandoff([record]);const panel=env.get('prompt-details'),button=env.get('show-prompt'),prompt=env.get('handoff-prompt').value;
 assert.equal(panel.hidden,true);button.onclick();assert.equal(panel.hidden,false);assert.equal(button['aria-expanded'],'true');assert.equal(env.get('handoff-prompt').value,prompt);button.onclick();assert.equal(panel.hidden,true);button.onclick();assert.equal(panel.hidden,false);assert.equal(env.get('handoff-prompt').value,prompt);
});
test('reopening a pending batch retains IDs and prompt; a new batch cannot accept the old response',()=>{
 const sources=[{...record,id:'photo-a',questions:[]},{...record,id:'photo-b',questions:[]}],env=app(sources);env.api.setPending(sources.map(r=>r.id));
 env.api.renderBatchHandoff(sources);const first=env.get('handoff-prompt').value;env.api.home();env.api.renderBatchHandoff(env.api.pendingSources());assert.equal(env.get('handoff-prompt').value,first);
 assert.match(first,/作業の選択肢や開始確認は不要/);assert.match(first,/IDを新しく作ったり/);
});
