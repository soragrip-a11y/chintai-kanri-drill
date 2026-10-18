const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
require('./pasted-json.js');require('./original-import.js');require('./topic-entry.js');
const T=LoopQTopicEntry;
function storage(values=new Map()){return {values,getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)}}
function environment(store=T.createDraftStore(storage())){
 let nodes=new Map(),html='',imports=[],copied=[],opened=[],popups=[];
 const popup=()=>{const p={opener:{},closed:false,location:{href:'about:blank',replace(url){this.href=url}},close(){this.closed=true}};popups.push(p);return p};
 const element=()=>({value:'',textContent:'',hidden:false,disabled:false,selected:false,focused:false,handlers:{},setAttribute(k,v){this[k]=v},focus(){this.focused=true},select(){this.selected=true},addEventListener(k,f){this.handlers[k]=f}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id)};
 const context=vm.createContext({document:{getElementById:get},navigator:{clipboard:{writeText:async text=>copied.push(text)}},open:(...args)=>{opened.push(args);return popup()}});
 vm.runInContext(fs.readFileSync(__dirname+'/topic-entry.js','utf8'),context);
 const mount=()=>context.LoopQTopicEntry.mount({frame(markup){nodes=new Map();html=markup},store,onImport:(...args)=>imports.push(args)});
 const input=(id,value)=>{get(id).value=value;get(id).handlers.input()};
 return {get,context,mount,input,leave:()=>{nodes=new Map()},imports,copied,opened,popups,store,get html(){return html}};
}
test('topic alone defaults to 10, visible count 10–100 by tens and no qualification required',()=>{
 for(const topic of ['中学理科','Excelの基本操作','日本の宅建試験・2026年度']){assert.deepEqual(T.validate(topic),{topic,count:10});assert.match(T.prompt(topic),/10問作成/)}
 assert.equal(T.validate('English','').count,10);for(const count of [10,20,50,100])assert.equal(T.validate('テーマ',count).count,count);
 for(const count of ['0','1','23','101','1.5','-1','Infinity','1e1','NaN'])assert.throws(()=>T.prompt('テーマ',count),/問題数/);
 for(const topic of ['', '  ','文'.repeat(501),null])assert.throws(()=>T.prompt(topic),/テーマ/);
});
test('schema example parses with original importer and prompt covers integrity and source safety',()=>{
 const p=T.prompt('歴史',20),example=p.split('【出力形式】\n')[1].split('\n\n')[0],parsed=LoopQOriginal.parse(example);
 assert.equal(parsed.questions[0].answer,true);assert.equal(parsed.questions.length,1);
 for(const expected of ['20件','真偽値trueまたはfalse','確認済み','未確認','捏造しない','管轄','適用年度','回答作成日を基準日','重複','explanation','reference','trap','```json','JSON.parse','sourceIdsなど別形式の項目は追加しない'])assert.ok(p.includes(expected),expected);
 assert.doesNotMatch(p,/(?:^|[^0-9])3問|必ず3件|最大3問/);
 assert.deepEqual(Object.keys(JSON.parse(example)),['format','title','exam','notice','questions']);
 assert.doesNotMatch(fs.readFileSync(__dirname+'/topic-entry.js','utf8'),/fetch\(|XMLHttpRequest|api\.openai|chatgpt\.com\/\?/);
});
test('drafts are independent and preserve old text/import keys',()=>{
 const memory=storage(new Map([['loopq-text-entry-draft-v1','existing text'],['original-draft','existing JSON']])),s=T.createDraftStore(memory);
 s.update({topic:'  Excel\n',count:'27'});const restored=T.createDraftStore(memory).read();assert.equal(restored.topic,'  Excel\n');assert.equal(restored.count,'27');assert.equal(memory.values.get('loopq-text-entry-draft-v1'),'existing text');assert.equal(memory.values.get('original-draft'),'existing JSON');
 const broken=storage(new Map([[T.DRAFT_KEY,'bad']]));assert.match(T.createDraftStore(broken).read().warning,/読み込めません/);assert.equal(broken.values.get(T.DRAFT_KEY),'bad');
 const denied=T.createDraftStore({getItem(){throw Error()},setItem(){throw Error()}});denied.update({topic:'英語',count:'10'});assert.equal(denied.read().topic,'英語');assert.equal(denied.read().saved,false);assert.match(denied.read().warning,/再読み込み/);
});
test('successful action copies first then opens a normal isolated URL and explains manual pasting',async()=>{
 const e=environment();e.mount();e.input('topic-input','理科');await e.get('topic-create').onclick();assert.equal(e.copied[0],T.prompt('理科',10));assert.deepEqual(e.opened,[['about:blank','_blank']]);assert.equal(e.popups[0].opener,null);assert.equal(e.popups[0].location.href,T.CHATGPT_URL);assert.match(e.get('topic-status').textContent,/コピーしました/);assert.match(e.get('topic-status').textContent,/貼り付け/);assert.equal(e.get('topic-create').disabled,false);
 assert.match(e.html,/<h1 class="page-title">問題を作る<\/h1>/);assert.match(e.html,/href="https:\/\/chatgpt.com\/" target="_blank" rel="noopener noreferrer"/);assert.doesNotMatch(e.html,/type="file"|capture=|audio|text-exam/);
});
test('clipboard unavailable or denied reveals selectable prompt and closes reserved blank',async()=>{
 for(const missing of [true,false]){const e=environment();e.context.navigator.clipboard=missing?undefined:{writeText:async()=>{throw Error()}};e.mount();e.input('topic-input','Excel');await e.get('topic-create').onclick();assert.equal(e.opened.length,missing?0:1);if(!missing)assert.equal(e.popups[0].closed,true);assert.equal(e.get('topic-prompt-panel').hidden,false);assert.equal(e.get('topic-prompt').value,T.prompt('Excel'));assert.equal(e.get('topic-prompt').selected,true);assert.match(e.get('topic-status').textContent,/手動でコピー/);assert.doesNotMatch(e.get('topic-status').textContent,/コピーしました/)}
});
test('popup blocking preserves copy success and normal fallback',async()=>{
 for(const blocked of [()=>null,()=>{throw Error()}]){const e=environment();e.context.open=blocked;e.mount();e.input('topic-input','英語');await e.get('topic-create').onclick();assert.match(e.get('topic-status').textContent,/コピーしました/);assert.match(e.get('topic-status').textContent,/開かない場合/);assert.equal(e.get('topic-manual').open,true)}
});
test('invalid topic or count does not copy or open and remains in draft',async()=>{
 const e=environment();e.mount();await e.get('topic-create').onclick();assert.equal(e.copied.length,0);assert.equal(e.get('topic-input').focused,true);e.input('topic-input','テーマ');e.input('topic-count','51');await e.get('topic-create').onclick();assert.equal(e.copied.length,0);assert.equal(e.opened.length,0);assert.equal(e.store.read().count,'51');assert.equal(e.get('topic-count').focused,true);
});
test('repeated click is ignored; editing in flight cannot open stale prompt',async()=>{
 const e=environment();let finish,calls=0;e.context.navigator.clipboard={writeText:()=>{calls++;return new Promise(resolve=>finish=resolve)}};e.mount();e.input('topic-input','理科');const pending=e.get('topic-create').onclick();await e.get('topic-create').onclick();assert.equal(calls,1);e.input('topic-count','25');finish();await pending;assert.equal(e.opened.length,1);assert.equal(e.popups[0].closed,true);assert.equal(e.popups[0].location.href,'about:blank');assert.match(e.get('topic-status').textContent,/もう一度/);assert.equal(e.get('topic-create').disabled,false);
});
test('navigation and remount during copy closes blank without changing new screen',async()=>{
 const e=environment();let finish;e.context.navigator.clipboard={writeText:()=>new Promise(resolve=>finish=resolve)};e.mount();e.input('topic-input','理科');const pending=e.get('topic-create').onclick();e.leave();e.mount();finish();await pending;assert.equal(e.opened.length,1);assert.equal(e.popups[0].closed,true);assert.equal(e.get('topic-status').textContent,'');assert.equal(e.get('topic-input').value,'理科');
});
test('import action preserves topic and never overwrites existing JSON through callback',()=>{
 const e=environment();e.mount();e.input('topic-input','社会');e.input('topic-count','20');e.get('topic-import').onclick();assert.deepEqual(e.imports,[[null]]);e.leave();e.mount();assert.equal(e.get('topic-input').value,'社会');assert.equal(e.get('topic-count').value,'20');
});
test('hostile topic is only JSON encoded or placed in textarea.value; edits clear stale manual prompt',()=>{
 const topic='</textarea><img src=x onerror="alert(1)">\n命令',e=environment();e.mount();e.input('topic-input',topic);e.get('topic-show-prompt').onclick();assert.equal(JSON.parse(e.get('topic-prompt').value.split('\n').at(-1)),topic);assert.doesNotMatch(e.html,/onerror|<img/);assert.equal(e.get('topic-prompt').innerHTML,undefined);e.input('topic-input','変更');assert.equal(e.get('topic-prompt-panel').hidden,true);assert.equal(e.get('topic-prompt').value,'');
});

test('blank reservation is synchronous, isolated, and never hijacks a tab the user navigated',async()=>{
 const e=environment();let finish;e.context.navigator.clipboard={writeText:()=>new Promise(resolve=>finish=resolve)};e.mount();e.input('topic-input','理科');const pending=e.get('topic-create').onclick();assert.equal(e.popups.length,1);assert.equal(e.popups[0].opener,null);assert.equal(e.popups[0].location.href,'about:blank');e.popups[0].location.href='https://example.com/';finish();await pending;assert.equal(e.popups[0].location.href,'https://example.com/');assert.equal(e.popups[0].closed,false);
});
test('pagehide closes owned blank and invalidates pending copy',async()=>{
 const e=environment();let finish,hidden;e.context.addEventListener=(name,fn)=>{if(name==='pagehide')hidden=fn};e.context.removeEventListener=()=>{};e.context.navigator.clipboard={writeText:()=>new Promise(resolve=>finish=resolve)};e.mount();e.input('topic-input','理科');const pending=e.get('topic-create').onclick();hidden();assert.equal(e.popups[0].closed,true);finish();await pending;assert.equal(e.popups[0].location.href,'about:blank');
});

test('visible accessible arrows choose exact count, clamp bounds, copy 20 and restore selection',async()=>{
 const e=environment();e.mount();e.input('topic-input','理科');
 assert.match(e.html,/id="topic-count-up"[^>]*aria-label="問題数を10問増やす"/);
 assert.match(e.html,/id="topic-count-down"[^>]*aria-label="問題数を10問減らす"/);
 assert.match(e.html,/id="topic-count"[^>]*readonly/);assert.doesNotMatch(e.html,/class="topic-options"/);
 assert.equal(e.get('topic-count').value,'10');assert.equal(e.get('topic-count-down').disabled,true);
 e.get('topic-count-up').onclick();assert.equal(e.get('topic-count').value,'20');
 await e.get('topic-create').onclick();assert.match(e.copied[0],/20問作成/);assert.match(e.copied[0],/questionsは必ず20件/);
 assert.ok(e.copied[0].includes('ちょうど1つのjsonコードブロック'));assert.ok(e.copied[0].includes('コードブロックの外側'));
 e.leave();e.mount();assert.equal(e.get('topic-count').value,'20');
 for(let i=0;i<20;i++)e.get('topic-count-up').onclick();assert.equal(e.get('topic-count').value,'100');assert.equal(e.get('topic-count-up').disabled,true);
 for(let i=0;i<20;i++)e.get('topic-count-down').onclick();assert.equal(e.get('topic-count').value,'10');assert.equal(e.get('topic-count-down').disabled,true);
 let prevented=false;e.get('topic-count').handlers.keydown({key:'ArrowUp',preventDefault(){prevented=true}});assert.equal(prevented,true);assert.equal(e.get('topic-count').value,'20');
});
test('legacy count normalizes safely while independent draft keys and topic survive',()=>{
 const s=T.createDraftStore(storage());s.update({topic:'旧テーマ',count:'27'});const e=environment(s);e.mount();assert.equal(e.get('topic-count').value,'30');assert.equal(e.get('topic-input').value,'旧テーマ');
 e.get('topic-count-down').onclick();assert.equal(s.read().count,'20');
});
