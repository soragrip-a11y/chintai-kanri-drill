/* Durable quiz checkpoints. Answers and learning counters commit together. */
(function(root){'use strict';
const STORE='quizSessions',VERSION=1,MODES=['all','weak','sets'];
const clone=value=>JSON.parse(JSON.stringify(value));
function fingerprint(q){
 const text=JSON.stringify([q.statement,q.answer,q.explanation,q.reference,q.trap,q.kind,q.originalId,q.sourcePage]);
 let a=2166136261,b=5381;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c}return (a>>>0).toString(16)+':'+(b>>>0).toString(16)+':'+text.length;
}
function key(sets,weakOnly=false,mode='sets'){return mode==='all'||mode==='weak'?mode:'sets:'+JSON.stringify([...new Set(sets.map(r=>r.id))].sort())+':'+(weakOnly?'weak':'all')}
function clean(raw,records){
 if(!raw||raw.version!==VERSION||typeof raw.id!=='string'||typeof raw.token!=='string'||!MODES.includes(raw.mode)||!Array.isArray(raw.pool)||!Array.isArray(raw.answers)||!Number.isInteger(raw.index)||raw.index<0||raw.pool.length>1000000)return null;
 const lookup=new Map(records.map(r=>[r.id,new Map((r.questions||[]).map(q=>[q.id,q]))])),seen=new Set(),pool=[],answers=[];let index=0;
 raw.pool.forEach((entry,i)=>{
  if(!entry||typeof entry.setId!=='string'||typeof entry.qid!=='string')return;
  const q=lookup.get(entry.setId)?.get(entry.qid),id=JSON.stringify([entry.setId,entry.qid]);
  if(!q||typeof q.answer!=='boolean'||fingerprint(q)!==entry.fingerprint||seen.has(id))return;
  seen.add(id);if(i<raw.index)index++;pool.push({...entry});
  const a=raw.answers[i];answers.push(a&&typeof a.picked==='boolean'&&typeof a.correct==='boolean'&&a.correct===(a.picked===q.answer)&&typeof a.answeredAt==='string'&&Number.isFinite(Date.parse(a.answeredAt))?{picked:a.picked,correct:a.correct,answeredAt:a.answeredAt}:null);
 });
 if(!pool.length)return null;
 index=Math.min(index,pool.length-1);
 return {version:VERSION,id:raw.id,token:raw.token,mode:raw.mode,weakOnly:raw.weakOnly===true,setIds:[...new Set(pool.map(x=>x.setId))],title:typeof raw.title==='string'?raw.title.slice(0,180):'復習',pool,answers,index,createdAt:raw.createdAt,updatedAt:raw.updatedAt};
}
function create(sets,weakOnly,mode,pool,token){
 const now=new Date().toISOString();return {version:VERSION,id:key(sets,weakOnly,mode),token,mode,weakOnly,setIds:sets.map(r=>r.id),title:mode==='all'?'総復習':mode==='weak'?'苦手に挑戦':sets.length===1?sets[0].title:sets.length+'セットの復習',pool,answers:pool.map(()=>null),index:0,createdAt:now,updatedAt:now};
}
function count(s){return s.answers.filter(Boolean).length}
function read(db){return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
function transaction(db,sourceStore,work){return new Promise((resolve,reject)=>{
 const tx=db.transaction([sourceStore,STORE],'readwrite');let result,error;
 tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(error||tx.error||Error('保存できません'));tx.onabort=()=>reject(error||tx.error||Error('保存を中止しました'));
 const fail=e=>{error=e;try{tx.abort()}catch{}},done=value=>{result=value};
 try{work(tx.objectStore(sourceStore),tx.objectStore(STORE),done,fail)}catch(e){fail(e)}
})}
function save(db,sourceStore,session,kind='position'){
 return transaction(db,sourceStore,(sources,sessions,done,fail)=>{
  const req=sessions.get(session.id);req.onsuccess=()=>{try{
   const current=req.result;let next;
   if(kind==='start')next=current||clone(session);
   else if(kind==='restart'){
    if(current&&current.token!==session.previousToken)throw Error('別の画面で復習が更新されました。ホームから開き直してください');
    next=clone(session);delete next.previousToken;
   }else{
    if(!current||current.token!==session.token)throw Error('復習が更新されました。ホームから開き直してください');
    const known=new Map(current.pool.map((x,i)=>[JSON.stringify([x.setId,x.qid,x.fingerprint]),current.answers[i]]));
    next=clone(session);next.answers=next.pool.map(x=>known.get(JSON.stringify([x.setId,x.qid,x.fingerprint]))||null);
   }
   next.updatedAt=new Date().toISOString();sessions.put(next);done(next);
  }catch(e){fail(e)}};
 });
}
function answer(db,sourceStore,session,value,grade){
 return transaction(db,sourceStore,(sources,sessions,done,fail)=>{
  const req=sessions.get(session.id);req.onsuccess=()=>{try{
   const current=req.result;if(!current||current.token!==session.token)throw Error('復習が更新されました。ホームから開き直してください');
   const entry=session.pool[session.index],at=current.pool.findIndex(x=>x.setId===entry.setId&&x.qid===entry.qid&&x.fingerprint===entry.fingerprint);
   if(at<0)throw Error('問題が変更されています。ホームから開き直してください');
   const source=sources.get(entry.setId);source.onsuccess=()=>{try{
    const r=source.result,q=r?.questions.find(q=>q.id===entry.qid);
    if(!q||typeof q.answer!=='boolean'||fingerprint(q)!==entry.fingerprint)throw Error('問題が変更または削除されました。ホームから開き直してください');
    if(current.answers[at]){done({record:r,session:current});return}
    const nextQ=grade(q,value),next={...r,questions:r.questions.map(q=>q.id===entry.qid?nextQ:q)};
    current.answers[at]={picked:value,correct:value===q.answer,answeredAt:nextQ.lastAnsweredAt};current.index=at;current.updatedAt=nextQ.lastAnsweredAt;
    sources.put(next);sessions.put(current);done({record:next,session:current});
   }catch(e){fail(e)}};
  }catch(e){fail(e)}};
 });
}
function remove(db,sourceStore,session){return transaction(db,sourceStore,(sources,sessions,done,fail)=>{const req=sessions.get(session.id);req.onsuccess=()=>{const current=req.result;if(current&&current.token!==session.token){fail(Error('復習が更新されました。ホームから開き直してください'));return}sessions.delete(session.id);done()}})}
function toggleWeak(db,sourceStore,setId,qid){return transaction(db,sourceStore,(sources,sessions,done,fail)=>{const req=sources.get(setId);req.onsuccess=()=>{try{const row=req.result;if(!row||!row.questions.some(q=>q.id===qid))throw Error('問題が削除されています');const next={...row,questions:row.questions.map(q=>q.id===qid?{...q,weak:!q.weak}:q)};sources.put(next);done(next)}catch(e){fail(e)}}})}
root.LoopQProgress=Object.freeze({STORE,VERSION,fingerprint,key,clean,create,count,read,save,answer,remove,toggleWeak});
})(globalThis);
