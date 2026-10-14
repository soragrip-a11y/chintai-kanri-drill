const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,image,record}=require('./test-support.cjs');
const question={statement:'<img src=x onerror=alert(1)>',answer:false,explanation:'解説',reference:'未確認',trap:'条件'},text=JSON.stringify({questions:[question,question,question]});
function flow(write=async()=>{},rs=[{...record,questions:[]}]){const env=app(rs,write);env.api.renderBatchHandoff(rs);return env}
function paste(get,value){get('generated-json').value=value;get('generated-json').input()}
function confirm(get){get('manual-review-ok').checked=true;get('manual-review-ok').onchange()}
test('paste automatically validates with safe preview; edits invalidate consent',()=>{
 const {get}=flow();paste(get,text);assert.equal(get('accept-json').disabled,true);assert.match(get('json-preview').children[0].children[2].textContent,/<img/);assert.equal(get('json-preview').children[0].children[2].innerHTML,undefined);confirm(get);assert.equal(get('accept-json').disabled,false);paste(get,text);assert.equal(get('manual-review-ok').checked,false);assert.equal(get('accept-json').disabled,true);
});
test('save starts quiz directly, without detail/start/preview page clicks',async()=>{
 const writes=[],{get,api,context,frames}=flow(async r=>writes.push(r));paste(get,text);confirm(get);await get('accept-json').onclick();assert.equal(writes.length,1);assert.equal(writes[0].questions.length,3);assert.equal(api.getQuiz().pool.length,3);assert.equal(context.location.hash,'#quiz');assert.match(frames.at(-1),/thumb-dock/);
});
test('quota failure keeps original record and input and allows retry',async()=>{
 let fail=true;const original={...record,questions:[]},writes=[],{get,api}=flow(async r=>{if(fail)throw Error('QuotaExceededError');writes.push(r)},[original]);paste(get,text);confirm(get);await get('accept-json').onclick();assert.equal(original.questions.length,0);assert.equal(api.getQuiz(),null);assert.equal(get('generated-json').value,text);assert.match(get('handoff-feedback').textContent,/Quota/);fail=false;await get('accept-json').onclick();assert.equal(writes.length,1);assert.equal(writes[0].image,image);
});
test('invalid response and existing history cannot save or start quiz',async()=>{
 let writes=0;for(const [rs,input] of [[[{...record,questions:[]}],'invalid'],[[record],text]]){const {get,api}=flow(async()=>writes++,rs);paste(get,input);confirm(get);await get('accept-json').onclick();assert.equal(writes,0);assert.equal(api.getQuiz(),null)}
});
test('two photos require IDs and create six questions in one save action',async()=>{
 const rs=[{...record,id:'a',questions:[]},{...record,id:'b',questions:[]}],{get,api}=flow(async()=>{},rs),batch=JSON.stringify({sets:rs.map(r=>({sourceId:r.id,questions:[question,question,question]}))});paste(get,batch);confirm(get);await get('accept-json').onclick();assert.equal(api.getQuiz().pool.length,6);assert.equal(api.getRecords().every(r=>r.questions.length===3),true);
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
 const {api,get,frames,context}=app([record]);api.setQuiz({pool:[{setId:'set',qid:'q'}],index:0,picked:null,sessionCorrect:0});api.quizPage();assert.match(frames.at(-1),/answer-grid thumb-dock/);await api.answer(true);assert.match(frames.at(-1),/thumb-dock.*id="next"/);get('next').onclick();assert.equal(context.location.hash,'#home');api.setQuiz({pool:[{setId:'set',qid:'q'}],index:0,picked:null,sessionCorrect:0});api.quizPage();get('quit').onclick();assert.equal(context.location.hash,'#home');
});
test('next occupies the side just tapped; rapid second tap cannot answer the next item',async()=>{
 for(const picked of [true,false]){const {api,get,frames}=app([{...record,questions:[...record.questions,{...record.questions[0],id:'q2'}]}]);api.setQuiz({pool:[{setId:'set',qid:'q'},{setId:'set',qid:'q2'}],index:0,picked:null,sessionCorrect:0});api.quizPage();await api.answer(picked);const dock=frames.at(-1).split('<div class="thumb-dock">')[1];assert.equal(dock.indexOf('id="next"')<dock.indexOf('data-go="home"'),picked);get('next').onclick();await api.answer(picked);assert.equal(api.getRecords()[0].questions[1].attempts,5);api.getQuiz().readyAt=0;await api.answer(picked);assert.equal(api.getRecords()[0].questions[1].attempts,6)}
});
test('successful commit is not reported as a failure when subsequent refresh fails',async()=>{
 const {api}=app([record]);api.setRefresh(async()=>{throw Error('read failed')});const saved={...record,id:'new',questions:[]};const result=await api.acceptCommitted([saved]);assert.equal(result[0].id,'new');assert.equal(api.getRecords().some(r=>r.id==='new'),true);assert.equal(api.getRecords().some(r=>r.id==='set'),true);
});
