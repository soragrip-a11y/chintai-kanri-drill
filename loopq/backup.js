/* Every downloadable part must satisfy the same limits as restore. */
(function(root){
 'use strict';
 const MAX_BYTES=75*1024*1024,MAX_RECORDS=10000;
 function parts(records,maxBytes=MAX_BYTES,maxRecords=MAX_RECORDS){
  const exportedAt=new Date().toISOString(),prefix=JSON.stringify({format:'loopq.v2',exportedAt}).slice(0,-1)+',"records":[',suffix=']}',base=new Blob([prefix,suffix]).size;
  const result=[];let rows=[],bytes=base;
  const finish=()=>{result.push(new Blob([prefix,rows.join(','),suffix],{type:'application/json'}));rows=[];bytes=base};
  for(const record of records){
   root.LoopQSafety.validateBackup({format:'loopq.v2',records:[record]});
   const row=JSON.stringify(record),size=new Blob([row]).size;
   if(base+size>maxBytes)throw Error('1件のデータが復元上限を超えています。写真を含む元データは保持されています。');
   if(rows.length&&(bytes+1+size>maxBytes||rows.length>=maxRecords))finish();
   bytes+=size+(rows.length?1:0);rows.push(row);
  }
  if(rows.length||!result.length)finish();
  return result;
 }
 root.LoopQBackup=Object.freeze({parts,MAX_BYTES});
})(globalThis);
