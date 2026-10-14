/* Untrusted clipboard text: no eval, quote repair, or answer coercion. */
(function(root){
 'use strict';
 function strict(text){
  const value=JSON.parse(text);
  const tokens=text.match(/"(?:\\.|[^"\\])*"|true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g)||[];
  let i=0;
  function walk(depth){
   if(depth>32)throw Error('JSONの入れ子が深すぎます');
   const token=tokens[i++];
   if(token==='{'){
    const seen=new Set();
    if(tokens[i]==='}'){i++;return}
    do{const key=JSON.parse(tokens[i++]);if(seen.has(key))throw Error('同じキーが重複しています：'+key);seen.add(key);i++;walk(depth+1)}while(tokens[i++ ]===',');
   }else if(token==='['){if(tokens[i]===']'){i++;return}do{walk(depth+1)}while(tokens[i++]===',')}
  }
  walk(0);return value;
 }
 function parse(input){
  if(typeof input!=='string'||input.length>30000)throw Error('回答は3万文字以内にしてください');
  let text=input.trim();if(!text)throw Error('回答が空です。ChatGPTの回答を貼り付けてください');
  let value,notes=[];
  // Only Markdown escapes on structural brackets, outside ordinary JSON strings.
  let quoted=false,escaped=false,normalized='';
  for(let i=0;i<text.length;i++){
   const c=text[i];
   if(quoted){normalized+=c;if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false}
   else if(c==='"'){quoted=true;normalized+=c}
   else if(c==='\\'&&text[i+1]&&'[]{}'.includes(text[i+1])){normalized+=text[++i]}
   else normalized+=c;
  }
  if(normalized!==text){text=normalized;notes.push('文字列外の括弧のMarkdownエスケープを除外しました')}
  try{value=strict(text)}catch(e){
   if(!(e instanceof SyntaxError))throw e;
   // Scan complete top-level objects, never inner question objects or string contents.
   let start=-1,depth=0,quoted=false,escaped=false;const spans=[];
   for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue}
    if(c==='"'&&depth){quoted=true;continue}
    if(c==='{'){if(depth++===0)start=i}
    else if(c==='}'&&depth&&--depth===0)spans.push(text.slice(start,i+1));
   }
   const candidates=[];
   for(const span of spans){try{const v=strict(span);if(v&&Object.hasOwn(v,'questions'))candidates.push(v)}catch(err){if(!(err instanceof SyntaxError))throw err}}
   if(candidates.length>1)throw Error('questionsを含むJSONが複数あります。保存する回答1つだけを貼り付けてください');
   if(candidates.length!==1||depth)throw Error(/[“”]/.test(text)?'曲がった引用符（“ ”）などでJSONが崩れています。引用符を一括置換せず、ChatGPTのコードブロックのコピーボタンでコピーし直してください。': 'JSONを読み取れません。途中切れ・エスケープ・DIL等の表示用表記を確認し、ChatGPTに同じ内容をJSONコードブロックで再出力させてコピーしてください。');
   value=candidates[0];notes.push('JSON外の前後文・コードフェンスを除外しました');
  }
  for(let n=0;typeof value==='string'&&n<2;n++){value=strict(value);notes.push('JSON文字列のエスケープを1層復号しました')}
  if(!value||Array.isArray(value)||typeof value!=='object'||!Array.isArray(value.questions)||value.questions.length!==3)throw Error('questionsに厳密に3問が必要です');
  if(Object.keys(value).some(k=>k!=='questions'))throw Error('ルートの項目はquestionsだけにしてください');
  const keys=['statement','answer','explanation','reference','trap'];
  value.questions.forEach((q,i)=>{
   if(!q||Array.isArray(q)||typeof q!=='object'||Object.keys(q).length!==5||Object.keys(q).some(k=>!keys.includes(k)))throw Error(`${i+1}問目：statement・answer・explanation・reference・trapの5項目が必要です`);
   if(typeof q.answer!=='boolean')throw Error(`${i+1}問目：answerは文字列や○×ではなくtrue/falseが必要です`);
   for(const k of keys.filter(k=>k!=='answer'))if(typeof q[k]!=='string'||q[k].length>(k==='explanation'?5000:k==='statement'?2500:1500)||((k==='statement'||k==='explanation')&&!q[k].trim()))throw Error(`${i+1}問目：${k}の文字列・長さを確認してください`);
  });
  return {questions:value.questions,notes};
 }
 root.LoopQPastedJSON=Object.freeze({parse});
})(globalThis);
