const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('./pasted-json.js');require('./original-import.js');require('./text-entry.js');
const T=LoopQTextEntry,raw='問1　合成の○×問題です。\n正答：○\n解説：合成の解説です。';
const json=n=>JSON.stringify({format:'loopq.original.v1',exam:'合成試験',questions:Array.from({length:n},(_,i)=>({originalId:String(i+1),statement:'合成問題 '+i,answer:i%2===0,explanation:'合成解説'}))});
function storage(values=new Map()) {return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}}
function environment(store=T.createDraftStore(storage())){
 let nodes=new Map(),html='',imports=[],copied=[];
 const element=()=>({value:'',textContent:'',hidden:false,disabled:false,children:[],selected:false,focused:false,handlers:{},setAttribute(k,v){this[k]=v},focus(){this.focused=true},select(){this.selected=true},addEventListener(k,f){this.handlers[k]=f}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const context=vm.createContext({document:{getElementById:get},navigator:{clipboard:{writeText:async text=>copied.push(text)}},LoopQOriginal,console});
 vm.runInContext(fs.readFileSync(__dirname+'/text-entry.js','utf8'),context);
 const mount=()=>context.LoopQTextEntry.mount({frame(markup){nodes=new Map();html=markup},exam:'合成試験',store,onImport:(...args)=>imports.push(args)});
 const input=(id,value)=>{get(id).value=value;get(id).handlers.input()};
 const leave=()=>{nodes=new Map()};
 return {get,context,mount,input,leave,imports,copied,store,get html(){return html}};
}
test('empty and plain input are distinguished from valid arbitrary-count JSON',()=>{
 for(const value of ['', '  \n '])assert.equal(T.inspect(value).kind,'empty');
 assert.equal(T.inspect(raw).kind,'raw');for(const label of ['[問1]','[1]','{問1}'])assert.equal(T.inspect(label+' 問題文\n正答：○').kind,'raw');assert.equal(T.inspect('\"Quoted problem\" is correct.').kind,'raw');
 for(const n of [1,3,8,168,1000])assert.equal(T.inspect(json(n)).count,n);
 assert.equal(T.inspect('```json\n'+json(8)+'\n```').kind,'json');
 assert.equal(T.inspect('結果です\n'+json(8)).kind,'json');
});
test('invalid JSON is not repaired or mistaken for source text',()=>{
 for(const text of ['{"questions":[', '{"questions":[{"statement":"q","answer":"false"}]}', json(1001), '[{"statement":"q"}]', '```json\n{"questions":[]}', '{"questions":[],"questions":[]}'])assert.equal(T.inspect(text).kind,'invalid-json',text.slice(0,80));
 assert.throws(()=>T.prompt(json(8),'試験'),/JSONです/);
 assert.throws(()=>T.prompt('{"questions":[','試験'),/形式/);
});
test('text has explicit limits and no silent truncation; JSON retains the larger existing limit',()=>{
 const near='文章'.repeat(T.MAX_RAW_CHARS/2);assert.equal(T.inspect(near).kind,'raw');assert.equal(T.inspect(near+'終').kind,'too-long');
 assert.equal(T.inspect('文'.repeat(T.MAX_JSON_CHARS+1)).kind,'too-long');
 const large=JSON.stringify({questions:Array.from({length:100},(_,i)=>({statement:'文'.repeat(1500),originalId:String(i)}))});assert.ok(large.length>T.MAX_RAW_CHARS);assert.equal(T.inspect(large).kind,'json');
 const source='  '+raw+'\n<script>alert("test")</script>\\';const p=T.prompt(source,'資格');assert.equal(JSON.parse(p.slice(p.lastIndexOf('\n')+1)),source);
});
test('formatting prompt preserves problem count, null unknown answers and provenance without generation or API',()=>{
 const p=T.prompt(raw,'合成試験');for(const expected of ['3問に制限せず','正答がない','null','知識で推測しない','元の順序','言い換え','省略せず','選択肢問題','JSON.parse','loopq.original.v1'])assert.ok(p.includes(expected),expected);
 assert.throws(()=>T.prompt(raw,''),/試験・資格/);assert.throws(()=>T.prompt(raw,'その他'),/試験・資格/);assert.throws(()=>T.prompt(raw,'x'.repeat(81)),/80文字/);
 assert.doesNotMatch(fs.readFileSync(__dirname+'/text-entry.js','utf8'),/fetch\(|XMLHttpRequest|api\.openai|api\/generate|window\.open/);
});
test('draft persists exactly across remount, another store instance and failed storage',()=>{
 const memory=storage(),store=T.createDraftStore(memory),text=' \n'+raw+'\n';store.update({text,exam:'資格'});assert.equal(T.createDraftStore(memory).read().text,text);
 const escaped='\n'.repeat(T.MAX_JSON_CHARS);store.update({text:escaped,exam:'資格'});assert.equal(T.createDraftStore(memory).read().text,escaped);
 const bad=T.createDraftStore({getItem(){throw Error('blocked')},setItem(){throw Error('quota')}});bad.update({text,exam:'資格'});assert.equal(bad.read().text,text);assert.equal(bad.read().saved,false);assert.match(bad.read().warning,/再読み込み/);
 const invalid=storage(new Map([[T.DRAFT_KEY,'broken']]));const untouched=T.createDraftStore(invalid);assert.equal(invalid.values.get(T.DRAFT_KEY),'broken');assert.match(untouched.read().warning,/読み込めません/);
});
test('raw text and exam survive leaving, returning and JSON import without accidental overwrite',()=>{
 const e=environment();e.mount();e.input('text-source',raw);e.input('text-exam','別資格');e.get('text-open-json').onclick();assert.deepEqual(e.imports,[ [null,'別資格'] ]);
 e.leave();e.mount();assert.equal(e.get('text-source').value,raw);assert.equal(e.get('text-exam').value,'別資格');
 e.get('text-import-response').onclick();assert.equal(e.imports[1][0],null);assert.equal(e.store.read().text,raw);
 e.input('text-source',json(8));assert.equal(e.get('text-import-detected').hidden,false);assert.equal(e.get('text-format-section').hidden,true);e.get('text-import-detected').onclick();assert.equal(e.imports[2][0],json(8));
});
test('successful copy includes exact source and never opens ChatGPT or submits it',async()=>{
 const e=environment();e.mount();e.input('text-source',raw);await e.get('text-copy-prompt').onclick();assert.equal(e.copied.length,1);assert.equal(e.copied[0],T.prompt(raw,'合成試験'));assert.match(e.get('text-copy-status').textContent,/コピーしました/);assert.equal(e.get('text-copy-prompt').disabled,false);
 assert.match(e.html,/href="https:\/\/chatgpt\.com\/" target="_blank" rel="noopener noreferrer"/);assert.doesNotMatch(e.html,/https:\/\/chatgpt\.com\/\?/);
});
test('clipboard denial and unavailable clipboard reveal exact selectable prompt without claiming success',async()=>{
 for(const unavailable of [false,true]){
  const e=environment();e.context.navigator.clipboard=unavailable?undefined:{writeText:async()=>{throw Error('denied')}};e.mount();e.input('text-source',raw);await e.get('text-copy-prompt').onclick();
  assert.equal(e.get('text-prompt-panel').hidden,false);assert.equal(e.get('text-prompt').value,T.prompt(raw,'合成試験'));assert.equal(e.get('text-prompt').selected,true);assert.match(e.get('text-copy-status').textContent,/手動でコピー/);assert.doesNotMatch(e.get('text-copy-status').textContent,/コピーしました/);
 }
});
test('empty, oversized and JSON input do not write clipboard; draft never loses the rejected input',async()=>{
 const e=environment();e.mount();await e.get('text-copy-prompt').onclick();assert.equal(e.copied.length,0);
 for(const text of ['文'.repeat(T.MAX_RAW_CHARS+1),json(8)]){e.input('text-source',text);assert.equal(e.get('text-copy-prompt').disabled,true);await e.get('text-copy-prompt').onclick();assert.equal(e.copied.length,0);assert.equal(e.store.read().text,text)}
});
test('untrusted source and exam never enter markup and the full prompt remains a textarea value',()=>{
 const hostile='</textarea><img src=x onerror="alert(1)">',e=environment();e.mount();e.input('text-source',raw+hostile);e.input('text-exam',hostile);e.get('text-show-prompt').onclick();assert.doesNotMatch(e.html,/<img|onerror="alert/);assert.ok(e.get('text-prompt').value.includes('</textarea><img'));assert.equal(e.get('text-prompt').innerHTML,undefined);
});
test('repeated copy, edit during copy and navigation do not produce stale UI success',async()=>{
 const e=environment();let finish;e.context.navigator.clipboard={writeText:()=>new Promise(resolve=>finish=resolve)};e.mount();e.input('text-source',raw);const first=e.get('text-copy-prompt').onclick();assert.equal(e.get('text-copy-prompt').disabled,true);await e.get('text-copy-prompt').onclick();e.input('text-source',raw+'変更');finish();await first;assert.match(e.get('text-copy-status').textContent,/もう一度/);assert.equal(e.get('text-copy-prompt').disabled,false);
 const next=e.get('text-copy-prompt').onclick();e.leave();e.mount();finish();await next;assert.equal(e.get('text-copy-status').textContent,'');assert.equal(e.get('text-source').value,raw+'変更');
});
test('manual prompt toggle reopens current text; edits invalidate displayed prompt',()=>{
 const e=environment();e.mount();e.input('text-source',raw);e.get('text-show-prompt').onclick();assert.equal(e.get('text-prompt-panel').hidden,false);e.get('text-show-prompt').onclick();assert.equal(e.get('text-prompt-panel').hidden,true);e.input('text-source',raw+'更新');e.get('text-show-prompt').onclick();assert.equal(e.get('text-prompt').value,T.prompt(raw+'更新','合成試験'));
});
test('app routes text entry into the existing validated importer and preserves both drafts on return',()=>{
 const {app}=require('./test-support.cjs'),e=app();
 // Load the DOM-bound module in the same realm as the app's fake document.
 e.context.sessionStorage=storage();vm.runInContext(fs.readFileSync(__dirname+'/text-entry.js','utf8'),e.context);
 e.api.home();assert.match(e.frames.at(-1),/data-go="text"[\s\S]*文章から問題を追加/);
 e.api.capture();assert.match(e.frames.at(-1),/data-go="text"/);assert.match(e.frames.at(-1),/data-go="original"/);assert.match(e.frames.at(-1),/capture-camera/);
 e.api.navigate('text');assert.equal(e.context.location.hash,'#text');e.get('text-source').value=raw;e.get('text-source').input();e.get('text-exam').value='保持する資格';e.get('text-exam').input();
 e.get('text-import-response').onclick();assert.equal(e.context.location.hash,'#original');assert.match(e.frames.at(-1),/id="original-exam"[^>]*value="保持する資格"/);
 e.get('original-text').value=json(8);e.get('original-text').input();e.api.navigate('text');assert.equal(e.get('text-source').value,raw);
 e.get('text-import-response').onclick();assert.equal(e.get('original-text').value,json(8));
 e.api.navigate('text');e.get('text-source').value=json(168);e.get('text-source').input();e.get('text-import-detected').onclick();assert.equal(e.get('original-text').value,json(168));assert.match(e.get('original-feedback').textContent,/168問/);
});
test('new text module is included before app startup and available to the service worker',()=>{
 const html=fs.readFileSync(__dirname+'/index.html','utf8'),sw=fs.readFileSync(__dirname+'/sw.js','utf8');
 assert.ok(html.indexOf('./text-entry.js?')<html.indexOf('./app.js?'));assert.match(html,/text-entry\.css/);assert.match(sw,/'\.\/text-entry\.js'/);assert.match(sw,/'\.\/text-entry\.css'/);
});
