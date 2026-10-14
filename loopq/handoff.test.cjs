const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
require('./pasted-json.js');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
function harness(record,write){
 const nodes=new Map();
 const element=()=>({value:'',checked:false,disabled:false,textContent:'',children:[],style:{},addEventListener(k,f){this[k]=f},append(x){this.children.push(x)},replaceChildren(){this.children=[]},scrollIntoView(){}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const context=vm.createContext({document:{getElementById:get,createElement:element},LoopQPastedJSON,setupLocalAI(){},handoffPrompt(){return ''},persist:write,uid:()=>Math.random().toString(),message(){},detail(){},escape:x=>x,navigator:{},LoopQSafety:{},console});
 vm.runInContext(source.slice(source.indexOf('function cleanPastedQuestions'),source.indexOf('function photoAsFile'))+source.slice(source.indexOf('function renderHandoff'),source.indexOf('async function setupLocalAI')),context);
 context.renderHandoff(record);return get;
}
const q={statement:'<img src=x onerror=alert(1)>',answer:false,explanation:'解説',reference:'未確認',trap:'要点'},text=JSON.stringify({questions:[q,q,q]});
test('preview uses text nodes, edits invalidate review, malformed input cannot save',async()=>{
 let writes=0;const get=harness({questions:[]},async()=>writes++);
 get('generated-json').value=text;get('preview-json').onclick();
 assert.equal(get('json-preview').children[1].textContent.includes(q.statement),true);
 assert.equal(get('json-preview').children[1].innerHTML,undefined);
 get('manual-review-ok').checked=true;get('generated-json').input();assert.equal(get('accept-json').disabled,true);assert.equal(get('manual-review-ok').checked,false);
 get('generated-json').value='invalid';get('preview-json').onclick();await get('accept-json').onclick();assert.equal(writes,0);
});
test('quota failure preserves original record; retry saves staged copy only',async()=>{
 const record={id:'original',questions:[],image:'unchanged',weak:true};let fail=true,saved;
 const get=harness(record,async r=>{if(fail)throw Error('QuotaExceededError');saved=r});
 get('generated-json').value=text;get('preview-json').onclick();get('manual-review-ok').checked=true;
 await get('accept-json').onclick();assert.equal(record.questions.length,0);assert.match(get('handoff-feedback').textContent,/Quota/);
 fail=false;await get('accept-json').onclick();assert.equal(saved.questions.length,3);assert.equal(saved.image,'unchanged');assert.equal(record.questions.length,0);
});
test('existing history is never overwritten',async()=>{
 let writes=0;const record={questions:[{attempts:7,correct:4}]},before=JSON.stringify(record),get=harness(record,async()=>writes++);
 get('generated-json').value=text;get('preview-json').onclick();get('manual-review-ok').checked=true;await get('accept-json').onclick();assert.equal(writes,0);assert.equal(JSON.stringify(record),before);
});
