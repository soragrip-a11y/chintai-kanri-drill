/* Validates untrusted LoopQ backups before writing to IndexedDB. */
(function(root){'use strict';
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&(Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
const str=(x,max,required=false)=>{if(typeof x!=='string'||x.length>max||(required&&x.trim().length===0))throw Error('文字列形式または文字数が不正です');return x};
const bool=x=>x===true;
const num=(x,max)=>{if(!Number.isSafeInteger(x)||x<0||x>max)throw Error('学習回数が不正です');return x};
const id=v=>{if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(v))throw Error('IDが不正です');return v};
const image=src=>{if(src==null||src==='')return null;if(typeof src!=='string'||src.length>9_000_000||!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))throw Error('画像データが不正です');return src};
const safeImage=src=>{try{return image(src)||''}catch{return ''}};
function question(q){if(!plain(q))throw Error('問題データが不正です');let attempts=num(q.attempts??0,1e7),correct=num(q.correct??0,1e7);if(correct>attempts||typeof q.answer!=='boolean')throw Error('回答形式が不正です');return {id:id(q.id),statement:str(q.statement,2500,true),answer:q.answer,explanation:str(q.explanation,5000,true),reference:str(q.reference??'',1500),trap:str(q.trap??'',1500),attempts,correct,weak:bool(q.weak)}}
function record(r){if(!plain(r)||!Array.isArray(r.questions)||r.questions.length>100)throw Error('問題セットが不正です');let seen=new Set();const questions=r.questions.map(q=>{const o=question(q);if(seen.has(o.id))throw Error('問題IDの重複');seen.add(o.id);return o});const createdAt=str(r.createdAt,64,true);if(!Number.isFinite(Date.parse(createdAt)))throw Error('日付が不正です');const status=str(r.status??'saved',64);if(!['saved','manual','ai_crosschecked','review_required'].includes(status))throw Error('状態が不正です');return {id:id(r.id),exam:str(r.exam,80,true),title:str(r.title,120,true),topic:str(r.topic??'',3000),image:image(r.image),questions,createdAt,weak:bool(r.weak),status}}
function validateBackup(raw){if(!plain(raw)||raw.format!=='loopq.v2'||!Array.isArray(raw.records)||raw.records.length>10000)throw Error('形式または件数が不正です');let seen=new Set();return raw.records.map(r=>{const o=record(r);if(seen.has(o.id))throw Error('セットIDの重複');seen.add(o.id);return o})}
root.LoopQSafety=Object.freeze({validateBackup,safeImage});
})(globalThis);
