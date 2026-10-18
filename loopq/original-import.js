/* Private original-question import. No OCR, generation, transmission or answer guessing. */
(function(root){
 'use strict';
 const MAX_QUESTIONS=1000,MAX_CHARS=1_000_000,MAX_BYTES=3_000_000;
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const string=(v,max,label,required=false)=>{if(typeof v!=='string'||v.length>max||(required&&!v.trim()))throw Error(label+'の文字列・長さを確認してください');return v};
 const page=(v,label)=>{if(v===undefined)return undefined;if(!Number.isSafeInteger(v)||v<1||v>100000)throw Error(label+'が不正です');return v};
 function parse(text){
  const {value,notes}=root.LoopQPastedJSON.extract(text,['questions'],MAX_CHARS);
  if(!object(value)||!Array.isArray(value.questions)||!value.questions.length||value.questions.length>MAX_QUESTIONS)throw Error('原文のquestionsには1〜'+MAX_QUESTIONS+'問を指定してください');
  if(value.format!==undefined&&value.format!=='loopq.original.v1')throw Error('原文JSONのバージョンが未対応です');
  const rootKeys=['format','title','exam','sourceFile','sourceSha256','notice','questions'];
  if(Object.keys(value).some(k=>!rootKeys.includes(k)))throw Error('JSONの項目を確認してください。対応形式はloopq.original.v1です。「問題を作る」の指示文を使い、sourceIdやsetsを含めずquestionsに問題を入れてください');
  const seen=new Set(),keys=['originalId','topic','statement','answer','explanation','reference','trap','sourcePage','answerPage'];
  const questions=value.questions.map((q,i)=>{
   if(!object(q)||Object.keys(q).some(k=>!keys.includes(k)))throw Error((i+1)+'問目：対応する形式は○×問題です。選択肢問題や未知の項目はそのまま取り込めません');
   if(q.answer!==undefined&&q.answer!==null&&typeof q.answer!=='boolean')throw Error((i+1)+'問目：answerはtrue/false、不明な場合はnullにしてください。正答は推測しません');
   const originalId=string(q.originalId??'',128,'元の問題番号');
   if(originalId&&seen.has(originalId))throw Error('元の問題番号が重複しています：'+originalId);if(originalId)seen.add(originalId);
   return {originalId,topic:string(q.topic??'',120,'分野'),statement:string(q.statement,2500,'問題文',true),answer:q.answer??null,explanation:string(q.explanation??'',5000,'解説'),reference:string(q.reference??'',1500,'出典'),trap:string(q.trap??'',1500,'要点'),...(q.sourcePage===undefined?{}:{sourcePage:page(q.sourcePage,'問題ページ')}),...(q.answerPage===undefined?{}:{answerPage:page(q.answerPage,'解答ページ')})};
  });
  const result={title:string(value.title??'取り込んだ元問題',120,'タイトル',true),exam:string(value.exam??'',80,'資格名'),sourceFile:string(value.sourceFile??'',300,'元ファイル名'),sourceSha256:string(value.sourceSha256??'',64,'元ファイルの識別値'),notice:string(value.notice??'',2000,'注記'),questions,notes};
  if(result.sourceSha256&&!/^[a-f0-9]{64}$/i.test(result.sourceSha256))throw Error('元ファイルの識別値が不正です');
  return result;
 }
 async function records(parsed,exam,now=new Date().toISOString()){
  string(exam,80,'資格名',true);
  const {notes,...payload}=parsed;
  // Derive IDs from all imported content, not an untrusted supplied file hash.
  const bytes=new TextEncoder().encode(JSON.stringify({...payload,exam}));
  if(!root.crypto?.subtle)throw Error('安全な重複検査が使えません。HTTPSのページで開き直してください');
  const hash=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  const groups=new Map();
  parsed.questions.forEach((q,index)=>{const topic=q.topic||parsed.title;if(!groups.has(topic))groups.set(topic,[]);groups.get(topic).push({...q,index})});
  const rows=[];
  for(const [topic,questions] of groups){
   for(let offset=0;offset<questions.length;offset+=100){
    const qs=questions.slice(offset,offset+100),suffix=questions.length>100?' ('+(offset/100+1)+')':'';
    rows.push({id:'original-'+hash+'-'+rows.length,title:(topic.slice(0,120-suffix.length)+suffix),exam,topic,image:null,createdAt:now,weak:false,status:'review_required',original:{format:'loopq.original.v1',title:parsed.title,sourceFile:parsed.sourceFile,sourceSha256:parsed.sourceSha256,notice:parsed.notice},questions:qs.map(({index,topic,...q})=>({...q,id:'original-q-'+(index+1),kind:'original',attempts:0,correct:0,weak:false}))});
   }
  }
  return rows;
 }
 root.LoopQOriginal=Object.freeze({parse,records,MAX_QUESTIONS,MAX_CHARS,MAX_BYTES});
})(globalThis);
