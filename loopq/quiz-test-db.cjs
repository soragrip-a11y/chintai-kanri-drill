const dir=process.env.LOOPQ_TARGET||__dirname;require(dir+'/quiz-progress.js');const P=LoopQProgress;
const clone=x=>x===undefined?undefined:structuredClone(x);
function database(rows=[],sessions=[]){
 const stores={sources:new Map(rows.map(x=>[x.id,clone(x)])),quizSessions:new Map(sessions.map(x=>[x.id,clone(x)]))};
 let chain=Promise.resolve(),failWrite=0;
 const db={stores,failWrite(n){failWrite=n},transaction(names,mode){
  names=Array.isArray(names)?names:[names];const jobs=[];let aborted=false,error=null,release,staged,write=0;
  const tx={error:null,abort(){aborted=true;error=Error('AbortError')},objectStore(name){if(!names.includes(name))throw Error('NotFoundError');
    const enqueue=(op,id,value)=>{const req={};jobs.push(()=>{try{if((op==='put'||op==='add'||op==='delete'||op==='clear')&&++write===failWrite){failWrite=0;throw Error('QuotaExceededError')}
      if(op==='get')req.result=clone(staged[name].get(id));if(op==='getAll')req.result=clone([...staged[name].values()]);if(op==='put'||op==='add'){if(op==='add'&&staged[name].has(value.id))throw Error('ConstraintError');staged[name].set(value.id,clone(value));req.result=value.id}if(op==='delete')staged[name].delete(id);if(op==='clear')staged[name].clear();req.onsuccess?.({target:req});
     }catch(e){req.error=e;req.onerror?.({target:req});aborted=true;error=e;tx.error=e}});return req};
    return {get:id=>enqueue('get',id),getAll:()=>enqueue('getAll'),put:value=>enqueue('put',value.id,value),add:value=>enqueue('add',value.id,value),delete:id=>enqueue('delete',id),clear:()=>enqueue('clear')};
  }};
  const prior=chain;chain=new Promise(r=>release=r);prior.then(async()=>{staged=Object.fromEntries(names.map(name=>[name,new Map(clone([...stores[name]]))]));await Promise.resolve();for(let i=0;i<jobs.length&&!aborted;i++){jobs[i]();await Promise.resolve()}
   if(aborted){tx.error=error;tx.onabort?.({target:tx})}else{if(mode==='readwrite')for(const name of names){stores[name].clear();for(const pair of staged[name])stores[name].set(...pair)}tx.oncomplete?.({target:tx})}release();});return tx;
 }};return db;
}
const baseQ=(id)=>({id,statement:'問題 '+id,answer:true,explanation:'解説 '+id,reference:'QA出典',trap:'QA要点',attempts:4,correct:2,weak:true,successDays:0,lastSuccessDay:''});
const rows=()=>[{id:'a',exam:'QA資格',title:'A',topic:'保持するメモ',image:'data:image/jpeg;base64,YQ==',weak:true,createdAt:'2026-10-01T00:00:00Z',status:'manual',questions:[baseQ('a1'),baseQ('a2')]},{id:'b',exam:'QA資格',title:'B',topic:'metadata',image:null,weak:false,createdAt:'2026-10-02T00:00:00Z',status:'manual',questions:[baseQ('b1')]}];
const poolFor=rs=>rs.flatMap(r=>r.questions.map(q=>({setId:r.id,qid:q.id,fingerprint:P.fingerprint(q)}))).reverse();
const sessionFor=(rs,mode='all')=>P.create(rs,mode==='weak',mode,poolFor(rs),'token_'+mode);
const grade=(q,picked)=>({...q,attempts:q.attempts+1,correct:q.correct+(picked===q.answer?1:0),lastAnsweredAt:'2026-10-16T03:00:00Z'});
const total=db=>[...db.stores.sources.values()].flatMap(x=>x.questions).reduce((n,q)=>n+q.attempts,0);

module.exports={database,rows,poolFor,sessionFor,grade,total,clone};
