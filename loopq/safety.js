/* LoopQ: validate all untrusted backup data before any database mutation. */
(function(root){
  'use strict';
  const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x) && (Object.getPrototypeOf(x)===Object.prototype || Object.getPrototypeOf(x)===null);
  const str = (x, max, required=false) => {
    if (typeof x !== 'string' || x.length>max || (required && x.trim().length===0)) throw new Error('文字列形式または文字数が不正です');
    return x;
  };
  const bool = x => x === true;
  const num = (x,max) => {
    if (!Number.isSafeInteger(x) || x<0 || x>max) throw new Error('学習回数が不正です');
    return x;
  };
  const id = v => { if(typeof v!=='string' || !/^[A-Za-z0-9_-]{1,128}$/.test(v)) throw new Error('IDが不正です');return v;};
  const image = src => {
    if(src===null||src===undefined||src==='') return null;
    if(typeof src!=='string'||src.length>9_000_000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src)) throw new Error('画像データが不正です');
    const body=src.slice(src.indexOf(',')+1);
    if(body.length>8_500_000)throw new Error('画像のサイズが大きすぎます');
    return src;
  };
  const safeImage = src => {try{return image(src)||''}catch{return ''}};
  function cleanQuestion(q){
    if(!plain(q))throw new Error('問題データが不正です');
    const attempts=num(q.attempts??0,10_000_000),correct=num(q.correct??0,10_000_000);
    if(correct>attempts)throw new Error('正答数が解答数を超えています');
    if(typeof q.answer!=='boolean')throw new Error('正解形式が不正です');
    return {id:id(q.id),statement:str(q.statement,2500,true),answer:q.answer,explanation:str(q.explanation,5000,true),reference:str(q.reference??'',1500),trap:str(q.trap??'',1500),attempts,correct,weak:bool(q.weak),mastered:bool(q.mastered),successDays:num(q.successDays??0,3),lastSuccessDay:str(q.lastSuccessDay??'',16)};
  }
  function cleanRecord(r){
    if(!plain(r))throw new Error('問題セットが不正です');
    if(!Array.isArray(r.questions)||r.questions.length>100)throw new Error('問題数が多すぎます');
    const seen=new Set();
    const questions=r.questions.map(q=>{const v=cleanQuestion(q);if(seen.has(v.id))throw new Error('問題IDが重複しています');seen.add(v.id);return v});
    const createdAt=str(r.createdAt,64,true);
    if(!Number.isFinite(Date.parse(createdAt)))throw new Error('保存日付が不正です');
    const status=str(r.status??'saved',64);
    if(!['saved','manual','ai_crosschecked','review_required'].includes(status))throw new Error('問題の状態が不正です');
    return {id:id(r.id),exam:str(r.exam,80,true),title:str(r.title,120,true),topic:str(r.topic??'',3000),image:image(r.image),questions,createdAt,weak:bool(r.weak),status};
  }
  function validateBackup(raw){
    if(!plain(raw)||raw.format!=='loopq.v2'||!Array.isArray(raw.records)||raw.records.length>10_000)throw new Error('バックアップ形式または件数が不正です');
    const ids=new Set();
    const records=raw.records.map((r)=>{const clean=cleanRecord(r);if(ids.has(clean.id))throw new Error('問題セットIDが重複しています');ids.add(clean.id);return clean});
    return records;
  }
  root.LoopQSafety=Object.freeze({validateBackup,safeImage});
})(globalThis);
