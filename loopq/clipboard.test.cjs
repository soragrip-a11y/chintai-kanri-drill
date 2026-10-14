const {test}=require('node:test'),assert=require('node:assert/strict');
const {app,record}=require('./test-support.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function flow(write){const env=app([{...record,questions:[]}]);env.context.Blob=Blob;env.context.ClipboardItem=class{constructor(data){this.data=data}};env.context.navigator.clipboard={write};env.api.setShareBundle(async()=>({file:{name:'test.jpg'},png:new Blob(['png'],{type:'image/png'})}));env.api.renderBatchHandoff([{...record,questions:[]}]);await tick();return env}
test('one user click writes PNG and original prompt together, without awaiting conversion',async()=>{
 const calls=[],{api,get}=await flow(items=>{calls.push(items);return Promise.resolve()});assert.equal(get('copy-image-prompt').disabled,false);get('copy-image-prompt').onclick();assert.equal(calls.length,1);assert.equal(calls[0].length,1);assert.deepEqual(Object.keys(calls[0][0].data),['image/png','text/plain']);assert.equal(await calls[0][0].data['text/plain'].text(),api.batchPrompt([{...record,questions:[]}]));await tick();assert.match(get('share-feedback').textContent,/両方が表示された/);assert.equal(get('copy-image-prompt').disabled,false);
});
test('permission denial gives manual fallback without claiming a successful copy',async()=>{
 const {get}=await flow(()=>Promise.reject(Error('NotAllowedError')));get('copy-image-prompt').onclick();await tick();assert.match(get('share-feedback').textContent,/同時コピーできません/);assert.equal(get('copy-image-prompt').disabled,false);
});
test('unsupported write and double tap are handled without another write',async()=>{
 let finish,writes=0;const {get}=await flow(()=>{writes++;return new Promise(resolve=>finish=resolve)});get('copy-image-prompt').onclick();get('copy-image-prompt').onclick();assert.equal(writes,1);finish();await tick();const broken=await flow(()=>{throw Error('unsupported')});broken.get('copy-image-prompt').onclick();assert.match(broken.get('share-feedback').textContent,/同時コピーできません/);assert.equal(broken.get('copy-image-prompt').disabled,false);
});
