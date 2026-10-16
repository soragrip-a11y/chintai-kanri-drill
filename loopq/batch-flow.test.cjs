const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,image,record}=require('./test-support.cjs');
const question={statement:'<img src=x onerror=alert(1)>',answer:false,explanation:'解説',reference:'未確認',trap:'条件'},text=JSON.stringify({questions:[question,question,question]});
function flow(write=async()=>{},rs=[{...record,questions:[]}]){const env=app(rs,write);env.api.renderBatchHandoff(rs);return env}
function paste(get,value){get('generated-json').value=value;get('generated-json').input()}
test('safe automatic preview without recurring checkboxes or disabled save button',()=>{
 const {get,frames}=flow();paste(get,text);assert.equal(get('accept-json').disabled,false);assert.match(get('json-preview').children[0].children[2].textContent,/<img/);assert.equal(get('json-preview').children[0].children[2].innerHTML,undefined);assert.doesNotMatch(frames.at(-1),/manual-review-ok/);paste(get,'invalid');assert.equal(get('accept-json').disabled,false);assert.match(get('handoff-feedback').textContent,/保存できません/);
});
test('save starts quiz directly, without detail/start/preview page clicks',async()=>{
 const writes=[],{get,api,context,frames}=flow(async r=>writes.push(r));paste(get,text);await get('accept-json').onclick();assert.equal(writes.length,1);assert.equal(writes[0].questions.length,3);assert.equal(api.getQuiz().pool.length,3);assert.match(context.location.hash,/^#quiz\//);assert.match(frames.at(-1),/thumb-dock/);
});
test('quota failure keeps original record and input and allows retry',async()=>{
 let fail=true;const original={...record,questions:[]},writes=[],{get,api}=flow(async r=>{if(fail)throw Error('QuotaExceededError');writes.push(r)},[original]);paste(get,text);await get('accept-json').onclick();assert.equal(original.questions.length,0);assert.equal(api.getQuiz(),null);assert.equal(get('generated-json').value,text);assert.match(get('handoff-feedback').textContent,/Quota/);fail=false;await get('accept-json').onclick();assert.equal(writes.length,1);assert.equal(writes[0].image,image);
});
test('invalid response and existing history cannot save or start quiz',async()=>{
 let writes=0;for(const [rs,input] of [[[{...record,questions:[]}],'invalid'],[[record],text]]){const {get,api}=flow(async()=>writes++,rs);paste(get,input);await get('accept-json').onclick();assert.equal(writes,0);assert.equal(api.getQuiz(),null)}
});
test('two photos require IDs and create six questions in one save action',async()=>{
 const rs=[{...record,id:'a',questions:[]},{...record,id:'b',questions:[]}],{get,api}=flow(async()=>{},rs),batch=JSON.stringify({sets:rs.map(r=>({sourceId:r.id,questions:[question,question,question]}))});paste(get,batch);await get('accept-json').onclick();assert.equal(api.getQuiz().pool.length,6);assert.equal(api.getRecords().every(r=>r.questions.length===3),true);
});
test('camera adds consecutively, gallery appends multiple, invalid group leaves draft intact',async()=>{
 const {api,get}=app();api.setImageProcessor(async f=>{if(f.bad)throw Error('unsupported');return image});api.capture();const camera=get('capture-camera'),gallery=get('photo-input');camera.files=[{}];await camera.change({target:camera});camera.files=[{}];await camera.change({target:camera});assert.equal(api.getDraft().length,2);gallery.files=[{},{}];await gallery.change({target:gallery});assert.equal(api.getDraft().length,4);gallery.files=[{},{}];await gallery.change({target:gallery});assert.equal(api.getDraft().length,4);assert.match(get('capture-status').textContent,/5枚/);gallery.files=[{bad:true}];await gallery.change({target:gallery});assert.equal(api.getDraft().length,4);assert.match(get('capture-status').textContent,/unsupported/);
});
test('failed image within a gallery selection does not add earlier images of that selection',async()=>{
 const {api,get}=app();api.setImageProcessor(async f=>{if(f.bad)throw Error('broken');return image});api.setPhoto(image);api.capture();const input=get('photo-input');input.files=[{},{bad:true}];await input.change({target:input});assert.equal(api.getDraft().length,1);
});
test('failed source save retains photos and retry uses same count; pending batch resumes from home',async()=>{
 let fail=true;const {api,get,frames}=app([],async()=>{if(fail)throw Error('quota')});api.setDraft([{image},{image}]);api.capture();get('exam').value='資格';await get('save-source').onclick();assert.equal(api.getDraft().length,2);assert.equal(api.getRecords().length,0);fail=false;await get('save-source').onclick();assert.equal(api.getDraft().length,0);assert.equal(api.pendingSources().length,2);api.navigate('home');assert.match(frames.at(-1),/resume-batch/);await get('resume-batch').click();assert.match(frames.at(-1),/2枚から6問/);
});
test('answer/next share fixed dock; result and quit offer one-tap home',async()=>{
 const {api,get,frames,context}=app([record]);api.setQuiz({pool:[{setId:'set',qid:'q'}],index:0,picked:null,sessionCorrect:0});api.quizPage();assert.match(frames.at(-1),/thumb-dock quiz-dock/);await api.answer(true);assert.match(frames.at(-1),/thumb-dock.*id="next"/);await get('next').onclick();assert.equal(context.location.hash,'#home');api.setQuiz({pool:[{setId:'set',qid:'q'}],index:0,picked:null,sessionCorrect:0});api.quizPage();get('quit').onclick();assert.equal(context.location.hash,'#home');
});
test('next stays on the right below both answers; rapid second tap cannot answer the next item',async()=>{
 for(const picked of [true,false]){const {api,get,frames}=app([{...record,questions:[...record.questions,{...record.questions[0],id:'q2'}]}]);api.setQuiz({pool:[{setId:'set',qid:'q'},{setId:'set',qid:'q2'}],index:0,picked:null,sessionCorrect:0});api.quizPage();await api.answer(picked);const dock=frames.at(-1).split('<div class="quiz-navigation">')[1];assert.ok(dock.indexOf('id="previous"')<dock.indexOf('id="next"'));await get('next').onclick();await api.answer(picked);assert.equal(api.getRecords()[0].questions[1].attempts,5);api.getQuiz().readyAt=0;await api.answer(picked);assert.equal(api.getRecords()[0].questions[1].attempts,6)}
});
test('successful commit is not reported as a failure when subsequent refresh fails',async()=>{
 const {api}=app([record]);api.setRefresh(async()=>{throw Error('read failed')});const saved={...record,id:'new',questions:[]};const result=await api.acceptCommitted([saved]);assert.equal(result[0].id,'new');assert.equal(api.getRecords().some(r=>r.id==='new'),true);assert.equal(api.getRecords().some(r=>r.id==='set'),true);
});
test('generated single-photo prompt example includes its actual ID and imports directly; batch example still imports',()=>{
 const {api}=app();
 for(const sources of [[{...record,id:'single-photo-id',questions:[]}],[{...record,id:'photo-a',questions:[]},{...record,id:'photo-b',questions:[]}]]){
  const prompt=api.batchPrompt(sources),sample=JSON.parse(prompt.slice(prompt.lastIndexOf('\n')+1)),ids=sources.map(r=>r.id);
  if(sources.length===1){assert.deepEqual(Object.keys(sample),['sourceId','questions']);assert.equal(sample.sourceId,ids[0]);assert.match(prompt,/最上位をsourceIdとquestionsの2項目だけ/)}
  else{assert.deepEqual(sample.sets.map(set=>set.sourceId),ids);assert.match(prompt,/最上位をsetsだけ/)}
  assert.match(prompt,/各設問の5項目はstatement・answer・explanation・reference・trap/);assert.match(prompt,/途中の返信（status・message）は完成した回答として出力しない/);
  const result=LoopQBatch.parse('```json\n'+JSON.stringify(sample)+'\n```',ids);
  assert.deepEqual(result.sets.map(set=>set.sourceId),ids);assert.ok(result.sets.every(set=>set.questions.length===3));
 }
});
test('single sourceId answer saves three questions with unchanged photo; wrong IDs and interim status never save',async()=>{
 const writes=[],{get,api}=flow(async row=>writes.push(row)),alias=JSON.stringify({sourceId:record.id,questions:[question,question,question]});
 paste(get,alias);await get('accept-json').onclick();
 assert.equal(writes.length,1);assert.equal(writes[0].image,image);assert.equal(writes[0].questions.length,3);
 assert.equal(writes[0].questions[0].statement,question.statement);assert.equal(api.getQuiz().pool.length,3);
 for(const input of [JSON.stringify({sourceId:'another-photo',questions:[question,question,question]}),'```json\n'+JSON.stringify({status:'確認中',sourceId:record.id,message:'途中の返信'})+'\n```']){
  const original={...record,questions:[]},before=structuredClone(original),env=flow(async()=>{throw Error('unexpected write')},[original]);
  paste(env.get,input);await env.get('accept-json').onclick();
  assert.deepEqual(original,before);assert.equal(env.api.getQuiz(),null);assert.match(env.get('handoff-feedback').textContent,input.includes('status')?/完成した問題が含まれていません/:/写真IDが一致しません/);
 }
});
