/* Batch imports are explicitly identified, validated, and committed atomically. */
(function(root){
 'use strict';
 const MAX_PHOTOS=5,MAX_IMAGE_CHARS=25_000_000;
 function parse(text,ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>MAX_PHOTOS||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(id)))throw Error('対象写真の指定が不正です');
  const {value:extracted,notes}=root.LoopQPastedJSON.extract(text,['sets','questions','status'],150000);let value=extracted;
  const object=value!==null&&typeof value==='object'&&!Array.isArray(value);
  const complete='対象は'+ids.length+'枚です。写真ごとに3問ずつ含む回答全体を貼り付けてください。この画面の「① 指示文をコピー」から作成し直せます';
  if(object&&Object.hasOwn(value,'status')&&!Object.hasOwn(value,'questions')&&!Object.hasOwn(value,'sets'))throw Error('完成した問題が含まれていません。「確認中」などの途中の返信は保存できません。'+complete);
  if(ids.length===1&&value&&Object.keys(value).length===1&&Object.hasOwn(value,'questions'))return {sets:[{sourceId:ids[0],questions:root.LoopQPastedJSON.parse(JSON.stringify(value)).questions}],notes};
  if(object&&Object.keys(value).length===2&&Object.hasOwn(value,'sourceId')&&Object.hasOwn(value,'questions')){
   if(ids.length!==1)throw Error('回答は写真1枚分です。'+complete);
   value={sets:[value]};
  }
  if(!value||Array.isArray(value)||typeof value!=='object'||Object.keys(value).length!==1||!Array.isArray(value.sets))throw Error('JSONの形式が違います。'+complete);
  if(value.sets.length!==ids.length)throw Error('写真の数が一致しません。'+complete);
  const seen=new Map();
  for(const set of value.sets){
   if(!set||Array.isArray(set)||typeof set!=='object'||Object.keys(set).length!==2||!Object.hasOwn(set,'sourceId')||!Object.hasOwn(set,'questions'))throw Error('各セットにはsourceIdとquestionsだけを指定してください');
   if(typeof set.sourceId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(set.sourceId))throw Error('回答のsourceIdは写真IDの文字列で指定してください');
   if(seen.has(set.sourceId))throw Error('回答で同じ写真IDが重複しています：'+set.sourceId+'。各写真は1セットにしてください。保存は行いません');
   if(!ids.includes(set.sourceId))throw Error('回答と保存先の写真IDが一致しません。保存先：'+ids.join(' / ')+'。回答：'+value.sets.map(x=>typeof x?.sourceId==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x.sourceId)?x.sourceId:'（不正なID）').join(' / ')+'。別の回の指示文・写真まとめが混ざっている可能性があります。この画面の指示文と写真まとめを同じ組で使用してください。回答のIDは自動変更していません');
   const questions=root.LoopQPastedJSON.parse(JSON.stringify({questions:set.questions})).questions;
   seen.set(set.sourceId,{sourceId:set.sourceId,questions});
  }
  if(seen.size!==ids.length)throw Error('回答のない写真があります');
  return {sets:ids.map(id=>seen.get(id)),notes};
 }
 // All reads occur in the write transaction. A stale UI cannot overwrite history.
 function commit(db,storeName,rows,mode){
  if(!['new','questions'].includes(mode))return Promise.reject(Error('保存モードが不正です'));
  if(!Array.isArray(rows)||!rows.length||rows.length>MAX_PHOTOS||rows.some(r=>!r||typeof r.id!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(r.id))||new Set(rows.map(r=>r.id)).size!==rows.length)return Promise.reject(Error('保存対象が不正です'));
  return new Promise((resolve,reject)=>{
   const tx=db.transaction(storeName,'readwrite'),store=tx.objectStore(storeName),saved=[];let failure=null;
   const abort=e=>{failure=e;try{tx.abort()}catch{}};
   tx.oncomplete=()=>resolve(saved);tx.onabort=()=>reject(failure||tx.error||Error('一括保存を中断しました'));tx.onerror=()=>{failure=failure||tx.error};
   for(const row of rows){
    const req=store.get(row.id);
    req.onsuccess=()=>{
     if(failure)return;
     try{
      const current=req.result;
      if(mode==='new'){
       if(current)throw Error('同じIDの保存済みデータがあります');
       const clean=root.LoopQSafety.validateBackup({format:'loopq.v2',records:[row]})[0];
       store.add(clean);saved.push(clean);
      }else{
       if(!current)throw Error('対象写真が削除されています。保存し直してください');
       if(!Array.isArray(current.questions)||current.questions.length)throw Error('既存の類題と学習履歴を保護するため、全体の保存を中止しました');
       const clean=root.LoopQSafety.validateBackup({format:'loopq.v2',records:[{...current,questions:row.questions,status:'review_required'}]})[0];
       // Validate, but preserve any existing metadata not understood by this importer.
       const next={...current,questions:clean.questions,status:'review_required'};
       store.put(next);saved.push(next);
      }
     }catch(e){abort(e)}
    };
   }
  });
 }
 root.LoopQBatch=Object.freeze({parse,commit,MAX_PHOTOS,MAX_IMAGE_CHARS});
})(globalThis);
