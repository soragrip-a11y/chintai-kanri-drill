const {test}=require('node:test');const assert=require('node:assert/strict');
require('./pasted-json.js');const parse=globalThis.LoopQPastedJSON.parse;
const q={statement:'条件： “引用” と {括弧}、\\n、<img src=x onerror=alert(1)>',answer:false,explanation:'解説\\と改行\n末尾',reference:'未確認',trap:'条件'};
const data={questions:[q,{...q,answer:true},{...q}]},text=JSON.stringify(data);
test('通常・コードフェンス・前後文・2層JSON文字列を意味変更なしで抽出',()=>{
 for(const input of [text,'```json\n'+text+'\n```','回答です。\n'+text+'\n以上です',JSON.stringify(text),JSON.stringify(JSON.stringify(text))])assert.deepEqual(parse(input).questions,data.questions);
});
test('曖昧・途中切れ・不正・過大入力を拒否',()=>{
 for(const input of ['',text+text,text.slice(0,-1),text.replace('"questions"','“questions”'),text.replace('false','"false"'),text.replace('false','0'),text.replace('"answer":false','"answer":true,"answer":false'),text.replace('"questions":','"__proto__":{},"questions":'),'x'.repeat(30001),'DIL: '+text.replaceAll('"','\\"'),'{"questions":[]}'])assert.throws(()=>parse(input),input.slice(0,60));
});
test('入れ子・未知の項目・長い出典を拒否',()=>{
 assert.throws(()=>parse('['.repeat(40)+'0'+']'.repeat(40)));
 for(const changed of [{...q,extra:1},{...q,reference:'x'.repeat(1501)},{...q,statement:' '},{...q,answer:null}])assert.throws(()=>parse(JSON.stringify({questions:[changed,q,q]})));
});
test('文字列内の重複キー風文字列・スマート引用符・コードを保持',()=>{
 const copy=structuredClone(data);copy.questions[0].statement='"a":1,"a":2 “そのまま” ```';assert.deepEqual(parse(JSON.stringify(copy)).questions,copy.questions);
});
test('旧版対応のMarkdown括弧を維持、文字列内のバックスラッシュを保持',()=>{
 const input=text.replace('"questions":[','"questions":\\[').replace(/\]\}$/,'\\]}');assert.deepEqual(parse(input).questions,data.questions);
});
test('math delimiters in structure get specific guidance and never alter content',()=>{
 const broken=String.raw`{"sets": \({"sourceId":"a","questions":\({"statement":"sample"}\)}\)}`;
 assert.throws(()=>LoopQPastedJSON.extract(broken,['sets']),/配列の括弧が数式表記/);
 const copy=structuredClone(data);copy.questions[0].statement=String.raw`数式 \(x\) と “引用”`;
 assert.deepEqual(parse(JSON.stringify(copy)).questions,copy.questions);
 assert.throws(()=>parse(text.slice(0,-1)),/コードブロックのコピーボタン/);
});
