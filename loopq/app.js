/* LoopQ v2 — private-first learning library. No external JS dependencies. */
(()=>{'use strict';
const DB='loopq-library-v2', STORE='sources', SETTING='loopq-settings-v2';
const EXAMS=['賃貸不動産経営管理士','宅地建物取引士','行政書士','FP','簿記','社会保険労務士','その他'];
const el=document.getElementById('app'),toastEl=document.getElementById('toast');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>{try{return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(s))}catch{return '—'}};
const uid=()=>globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const statDefault=()=>({answered:0,correct:0,updatedAt:null});
let db,records=[],route='home',filter='all',quiz=null,chosenFile=null,uploadPreview=null,saving=false,toastTimer;
let capturePhotos=[],captureLoading=false;
let quizSessions=[],quizBusy=false,navigationVersion=0;
let originalDraft='',originalExam='',originalImportSaving=false;
let libraryPage=0;const removedPhotos=new Map(),photoBusy=new Set();
let settings={exam:EXAMS[0]};try{settings=Object.assign(settings,JSON.parse(localStorage.getItem(SETTING)||'{}'))}catch{}
// ChatGPT plan-sharing only: until SIWC approval, generation stays disabled. No owner-billed API fallback.
function message(t){toastEl.textContent=t;toastEl.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),3300)}
function readDB(){return new Promise((res,rej)=>{const req=indexedDB.open(DB,2);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'id'});if(!req.result.objectStoreNames.contains(LoopQProgress.STORE))req.result.createObjectStore(LoopQProgress.STORE,{keyPath:'id'})};req.onblocked=()=>{el.innerHTML='<div class="content"><div class="notice warn" role="status"><strong>更新を待っています</strong><p>ほかのタブやホーム画面から開いているLoopQを閉じてください。閉じると、この画面で自動的に続行します。保存済みの問題・学習履歴はそのまま残ります。</p></div></div>';message('更新するには、ほかのタブで開いているLoopQを閉じてください')};req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();message('新しい版に更新されました。この画面を再読み込みしてください')};res(req.result)};req.onerror=()=>rej(req.error)})}
function tx(mode,fn){return new Promise((res,rej)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let val;t.oncomplete=()=>res(val);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error||Error('保存を中止しました'));try{val=fn(s)}catch(e){t.abort();rej(e)}})}
async function refresh(){const t=db.transaction(STORE,'readonly'),s=t.objectStore(STORE);records=await new Promise((res,rej)=>{const req=s.getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});records.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))}
async function persist(r){await tx('readwrite',s=>s.put(r));records=records.filter(x=>x.id!==r.id);records.push(r);records.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))}
async function remove(id){await tx('readwrite',s=>s.delete(id));await refresh()}
function isPracticeQuestion(q){return typeof q.answer==='boolean'}
function isWeakQuestion(q,r){return isPracticeQuestion(q) && !q.mastered && (q.weak === true || (q.attempts||0)>(q.correct||0) || r.weak===true)}
function isGraduated(q){return q.mastered===true}
function getStats(){const qs=records.flatMap(r=>r.questions||[]);const answers=qs.reduce((a,q)=>a+(q.attempts||0),0),correct=qs.reduce((a,q)=>a+(q.correct||0),0);return {sources:records.length,questions:qs.length,playable:qs.filter(isPracticeQuestion).length,answers,correct,accuracy:answers?Math.round(correct/answers*100):0,weak:records.reduce((n,r)=>n+(r.questions||[]).filter(q=>isWeakQuestion(q,r)).length,0),mastered:qs.filter(isGraduated).length}}
const sTitles={home:'ホーム',capture:'問題を追加',library:'マイ問題集',review:'苦手を復習',settings:'設定',detail:'問題セット',quiz:'復習セッション',manual:'手動で問題登録',original:'原文を取り込む',text:'文章から問題を追加'};
function frame(inner){document.getElementById('app').scrollTop=0;el.innerHTML=`<div class="content">${inner}</div>`;document.getElementById('crumb').textContent=sTitles[route]||'ホーム';document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===route));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));}
function navigate(to,params){navigationVersion++;route=to;quiz=to==='quiz'?params:quiz;const hash=to==='detail'?`detail/${params}`:to==='quiz'&&quiz?.id?'quiz/'+encodeURIComponent(quiz.id):to;if(location.hash!=='#'+hash)history.pushState(null,'','#'+hash);render();document.getElementById('app').scrollTop=0}
function updateUrl(){const k=decodeURIComponent(location.hash.replace(/^#/,''));if(k.startsWith('detail/')){route='detail';return k.split('/')[1]}if(k.startsWith('quiz/')){route='quiz';const id=k.slice(5);if(quiz?.id!==id)quiz=quizSessions.find(x=>x.id===id)||null;return null}if(['home','capture','library','review','settings','quiz','manual','original','text'].includes(k))route=k;return null}
function render(){const detailId=updateUrl();if(settings.aiUseNoticeVersion!==1)return onboarding();if(route==='home')return home();if(route==='capture')return capture();if(route==='library')return library();if(route==='review')return review();if(route==='settings')return preferences();if(route==='manual')return manual();if(route==='original')return originalImport();if(route==='text')return textEntry();if(route==='detail')return detail(detailId);if(route==='quiz'){if(!quiz&&location.hash==='#quiz')quiz=resumeSessions()[0]||null;return quizPage()}return home()}
function onboarding(){
 frame('<h1 class="page-title">はじめに1回だけ確認</h1><div class="card"><p>写真・問題・学習履歴は、この端末のブラウザ内に保存されます。</p><p>ChatGPTが作った問題・正答・出典は未検証です。必要に応じて一次資料を確認してください。写真IDや件数の検査だけでは内容の正確さは保証されません。</p><p>写真は自動送信されません。共有・添付はその都度、自分の操作で行います。</p><label class="toggle-line"><input id="initial-notice-check" type="checkbox"><span>内容を理解し、未検証のAI問題を学習に利用します。</span></label><button id="initial-notice-accept" class="btn primary">確認して始める</button><p id="initial-notice-feedback" class="smalltext" role="status"></p></div>');
 document.getElementById('initial-notice-accept').onclick=()=>{if(!document.getElementById('initial-notice-check').checked){document.getElementById('initial-notice-feedback').textContent='内容を確認してチェックしてください';return}settings.aiUseNoticeVersion=1;try{saveSettings()}catch{message('確認を端末に保存できませんでした。今回は続けられますが、次回もう一度確認が必要です')}render()};
}
function home(){const stats=getStats();const available=records.filter(r=>(r.questions||[]).some(isPracticeQuestion));const weak=available.filter(r=>r.questions.some(q=>isWeakQuestion(q,r)));frame(`
<section class="home-start">

 <h1>ホーム</h1>

 <div class="home-actions">
  <button class="home-action home-action-main" id="home-weak" ${weak.length?'':'disabled'}><span class="home-action-icon">↻</span><span><strong>苦手に挑戦</strong><small>${stats.weak}問の復習</small></span><span class="home-action-arrow">→</span></button>
  <button class="home-action" id="home-all" ${available.length?'':'disabled'}><span class="home-action-icon">▦</span><span><strong>総復習</strong><small>全${stats.playable}問から出題</small></span><span class="home-action-arrow">→</span></button>
  <button class="home-action" data-go="text"><span class="home-action-icon">✎</span><span><strong>文章から問題を追加</strong><small>文章を貼り付けて、ChatGPTで問題形式に</small></span><span class="home-action-arrow">→</span></button>
  <button class="home-action" data-go="capture"><span class="home-action-icon">＋</span><span><strong>写真・JSONから追加</strong><small>写真から類題・完成済みの問題JSONを登録</small></span><span class="home-action-arrow">→</span></button>
 </div>
 </section>
 ${resumeList()}
 <div class="home-progress-head"><strong>学習の進み具合</strong><span>習得 ${stats.mastered} / ${stats.questions}問</span></div>
 <div class="loopq-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${stats.questions}" aria-valuenow="${stats.mastered}"><span style="width:${stats.questions?Math.round(stats.mastered/stats.questions*100):0}%"></span></div>
 <div class="home-progress-summary"><span>卒業済み <b>${stats.mastered}</b></span><span>苦手 <b>${stats.weak}</b></span><button class="btn sm ghost" data-go="library">問題集を見る →</button></div>
 ${pendingSources().length?'<button class="btn teal resume-batch" id="resume-batch">未作成の写真から類題を作る（'+pendingSources().length+'枚）</button>':''}
 ${!available.length?'<p class="smalltext">まだ類題がありません。まず「問題を追加」から始めましょう。</p>':''}
`);
document.getElementById('home-weak').onclick=()=>startQuiz(weak,true,'weak');
wireResumeButtons();document.getElementById('home-all').onclick=()=>startQuiz(available,false,'all');document.getElementById('resume-batch')?.addEventListener('click',()=>renderBatchHandoff(pendingSources()));
}
function listRow(r){return `<div class="list-row"><span class="list-icon">${r.image?'▧':'✎'}</span><div class="list-text"><strong>${escape(r.title)}</strong><small>${escape(r.exam)} · ${date(r.createdAt)} · ${(r.questions||[]).length}問</small></div><button class="btn sm ghost" data-detail="${escape(r.id)}">開く</button></div>`}
function wireDetailButtons(){document.querySelectorAll('[data-detail]').forEach(x=>x.onclick=()=>navigate('detail',x.dataset.detail))}
function pendingSources(){return (Array.isArray(settings.pendingSourceIds)?settings.pendingSourceIds.slice(0,5):[]).map(id=>records.find(r=>r.id===id&&!r.questions.length)).filter(Boolean)}
async function acceptCommitted(rows){const ids=new Set(rows.map(r=>r.id));records=[...records.filter(r=>!ids.has(r.id)),...rows];try{await refresh()}catch{message('保存は完了しました。表示の再読込に失敗したため、必要ならホームを開き直してください')}return rows}
async function persistPhotos(rows){return acceptCommitted(await LoopQBatch.commit(db,STORE,rows,'new'))}
async function persistQuestions(sets){const rows=sets.map(set=>({id:set.sourceId,questions:set.questions.map(q=>({...q,id:uid(),attempts:0,correct:0,weak:false}))}));return acceptCommitted(await LoopQBatch.commit(db,STORE,rows,'questions'))}
function capture(){
 frame(`<h1 class="page-title">元問題を追加</h1><div class="card text-entry-invitation"><h2>文章を貼り付けて問題を入力</h2><button class="btn primary" data-go="text">文章から問題を追加</button><p class="smalltext">文章を貼る → ChatGPTで問題形式に整える → 完成した回答を保存</p></div><div class="card"><button class="btn primary" data-go="original">元の問題をそのまま取り込む（JSON）</button><p class="smalltext">問題数を変えず、元の○×問題を解く</p></div><div class="card capture-card"><div class="field"><label for="exam">試験・資格</label><select id="exam">${EXAMS.map(x=>`<option ${x===settings.exam?'selected':''}>${escape(x)}</option>`).join('')}</select></div><details class="custom-exam" id="custom-exam-options" ${EXAMS.includes(settings.exam)?'':'open'}><summary>一覧にない資格を入力</summary><div class="field"><label for="custom-exam">資格名</label><input id="custom-exam" maxlength="60" value="${EXAMS.includes(settings.exam)?'':escape(settings.exam)}"></div></details><div class="photo-choices"><label class="btn teal" for="capture-camera">写真を撮る</label><label class="btn ghost" for="photo-input">写真を追加</label><input id="capture-camera" type="file" accept="image/*" capture="environment" hidden><input id="photo-input" type="file" accept="image/*" multiple hidden></div><details class="details"><summary>複数枚をまとめて選べない場合</summary><p class="smalltext">写真ライブラリで複数選択できるか確認してください。できない場合は1枚ずつ追加するか、ファイルに保存した画像を選んでください。</p><label class="btn ghost sm" for="photo-files">ファイルの画像を選ぶ</label><input id="photo-files" type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif" multiple hidden></details><div id="photo-area" class="capture-strip" aria-label="追加する写真"></div><p class="smalltext" id="capture-count"></p><p class="smalltext">最大5枚。複数選択できない端末では、写真を追加して1枚ずつ選べます。</p><p class="smalltext" id="capture-status" role="status"></p><div class="flow-actions"><button class="btn ghost" data-go="home">ホーム</button><button class="btn primary" id="save-source">まとめて類題を作る</button></div><button class="btn ghost sm" data-go="manual">手動で問題を登録</button></div>`);
 const area=document.getElementById('photo-area'),btn=document.getElementById('save-source'),status=document.getElementById('capture-status');
 document.getElementById('exam').onchange=()=>{const other=document.getElementById('exam').value==='その他';document.getElementById('custom-exam-options').open=other;if(!other)document.getElementById('custom-exam').value=''};
 const draw=()=>{
  area.replaceChildren();capturePhotos.forEach((photo,i)=>{const box=document.createElement('div');box.className='capture-tile';const img=document.createElement('img');img.src=LoopQSafety.safeImage(photo.image);img.alt='写真'+(i+1);const removeButton=document.createElement('button');removeButton.className='btn ghost sm';removeButton.textContent=(i+1)+'枚目を外す';removeButton.disabled=captureLoading||saving;removeButton.onclick=()=>{if(captureLoading||saving)return;capturePhotos.splice(i,1);draw()};box.append(img,removeButton);area.append(box)});
  document.getElementById('capture-count').textContent=capturePhotos.length+'枚 → '+capturePhotos.length*3+'問';btn.textContent=capturePhotos.length===1?'類題を3問作る':'まとめて類題を作る';btn.disabled=captureLoading||saving;
 };
 const add=async input=>{
  const files=Array.from(input.files||[]);input.value='';if(!files.length)return;
  if(captureLoading||saving){status.textContent='読み込みが終わってから追加してください';return}
  if(capturePhotos.length+files.length>LoopQBatch.MAX_PHOTOS){status.textContent='一度に追加できる写真は5枚までです';return}
  captureLoading=true;draw();status.textContent='写真を読み込み中…';
  try{
   const staged=[];for(const file of files){const image=await processImage(file);staged.push({image});if([...capturePhotos,...staged].reduce((n,p)=>n+p.image.length,0)>LoopQBatch.MAX_IMAGE_CHARS)throw Error('画像の合計サイズが大きすぎます。枚数を減らしてください')}
   capturePhotos.push(...staged);status.textContent='';
  }catch(e){status.textContent='追加できません：'+e.message+'。今回選んだ写真は追加していません'}finally{captureLoading=false;if(document.getElementById('save-source')===btn)draw()}
 };
 document.getElementById('photo-input').addEventListener('change',e=>add(e.target));document.getElementById('photo-files').addEventListener('change',e=>add(e.target));document.getElementById('capture-camera').addEventListener('change',e=>add(e.target));draw();
 btn.onclick=async()=>{
  if(saving||captureLoading)return;
  if(!capturePhotos.length){status.textContent='元問題の写真を追加してください';return}
  const exam=document.getElementById('custom-exam').value.trim()||document.getElementById('exam').value;
  if(!exam||exam==='その他'){status.textContent='資格名を入力してください';return}
  saving=true;draw();status.textContent='写真をまとめて保存中…';
  const now=new Date(),label=new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(now);
  const rows=capturePhotos.map((photo,i)=>({id:uid(),title:'元問題 '+label+(capturePhotos.length>1?'（'+(i+1)+'枚目）':''),exam,topic:'',image:photo.image,questions:[],weak:false,createdAt:now.toISOString(),status:'saved'}));
  try{
   const saved=await persistPhotos(rows);settings.exam=exam;settings.pendingSourceIds=saved.map(r=>r.id);try{saveSettings()}catch{}
   capturePhotos=[];if(document.getElementById('save-source')===btn){navigate('detail',saved[0].id);renderBatchHandoff(saved)}else message('写真を保存しました。ホームから作成を再開できます');
  }catch(e){status.textContent='保存できません：'+e.message+'。写真は追加欄に残しています'}finally{saving=false;if(document.getElementById('save-source')===btn)draw()}
 };
}

async function persistOriginal(rows){
 const cleaned=LoopQSafety.validateBackup({format:'loopq.v2',records:rows});
 if(cleaned.some(row=>records.some(r=>r.id===row.id)))throw Error('この原文データは取り込み済みです。問題集から開いてください');
 await tx('readwrite',store=>{for(const row of cleaned)store.add(row)});
 return acceptCommitted(cleaned);
}
function textEntry(){LoopQTextEntry.mount({frame,exam:settings.exam,onImport:(text,exam)=>{if(text!==null)originalDraft=text;originalExam=exam||settings.exam;navigate('original')}})}
function originalImport(){
 frame(`<h1 class="page-title">問題形式のJSONを保存</h1><div class="card" id="original-import"><p>ChatGPTで整えた回答や、完成済みの○×問題・正答・解説をJSONから保存します。類題への作り替えや3問への制限はありません。</p><p class="smalltext">画像・PDFはここでは文字起こしできません。先に文字起こししたJSONを選んでください。最大1,000問。問題数・表記・正答を元資料と確認してください。内容や法令の正確さは自動検証しません。</p><div class="field"><label for="original-exam">試験・資格</label><input id="original-exam" maxlength="80" value="${escape(originalExam||settings.exam)}"></div><label class="btn primary" for="original-file">原文JSONファイルを選ぶ</label><input id="original-file" type="file" accept="application/json,.json" hidden><div class="field"><label for="original-text">ChatGPTの完成した回答（JSON）を貼り付け</label><textarea id="original-text" rows="5" maxlength="1000000" placeholder='{"questions":[{"statement":"元の問題文","answer":true,"explanation":"元の解説"}]}'></textarea></div><p class="smalltext" role="status" aria-live="polite" id="original-feedback"></p><details><summary id="original-preview-title">取り込む原文を確認</summary><div id="original-preview"></div></details><p class="smalltext">正答がない問題は「正答未確認」として保存し、採点する復習には出しません。保存済みの問題・学習履歴は置き換えません。</p><div class="flow-actions"><button class="btn ghost" data-go="capture">戻る</button><button class="btn primary" id="original-save">問題を保存して解く</button></div></div>`);
 const panel=document.getElementById('original-import'),input=document.getElementById('original-text'),feedback=document.getElementById('original-feedback'),button=document.getElementById('original-save'),fileInput=document.getElementById('original-file'),examInput=document.getElementById('original-exam');
 input.value=originalDraft;let busy=false,reading=0,filePending=false,fileBlocked=false;
 const updateSave=()=>button.disabled=busy||filePending||fileBlocked;
 const active=()=>document.getElementById('original-import')===panel;
 function inspect(){
  originalDraft=input.value;const preview=document.getElementById('original-preview');preview.replaceChildren();
  if(!input.value){feedback.textContent='JSONファイルを選ぶか、本文を貼り付けてください';return}
  try{const parsed=LoopQOriginal.parse(input.value),known=parsed.questions.filter(isPracticeQuestion).length;feedback.textContent=parsed.questions.length+'問を読み取りました。採点可能 '+known+'問 / 正答未確認 '+(parsed.questions.length-known)+'問';document.getElementById('original-preview-title').textContent='全'+parsed.questions.length+'問の原文を確認';
   const source=document.createElement('p');source.textContent=[parsed.title,parsed.sourceFile,parsed.notice].filter(Boolean).join(' / ');preview.append(source);
   for(const [i,q] of parsed.questions.entries()){const p=document.createElement('p');p.className='batch-question';p.textContent=(q.originalId||String(i+1))+'. '+q.statement+'\n正答：'+(q.answer===null?'未確認':q.answer?'○':'×')+'\n解説：'+(q.explanation||'記載なし')+(q.reference?'\n出典：'+q.reference:'')+(q.sourcePage?'\n元資料 '+q.sourcePage+'ページ':'');preview.append(p)}
  }catch(e){feedback.textContent='取り込めません：'+e.message}
 }
 const edit=()=>{reading++;filePending=false;fileBlocked=false;inspect();updateSave()};input.addEventListener('input',edit);input.addEventListener('change',edit);
 fileInput.onchange=async()=>{
  const file=fileInput.files?.[0];fileInput.value='';if(!file||busy)return;const request=++reading;filePending=true;fileBlocked=true;updateSave();feedback.textContent='JSONファイルを読み込み中…';
  if(file.size>LoopQOriginal.MAX_BYTES){filePending=false;feedback.textContent='JSONファイルは3MB以下にしてください。別のファイルを選ぶか、貼り付け欄を編集してください';updateSave();return}
  try{const text=await file.text();if(!active()||request!==reading||busy)return;const parsed=LoopQOriginal.parse(text);input.value=text;if(parsed.exam)examInput.value=parsed.exam;fileBlocked=false;inspect()}catch(e){if(active()&&request===reading)feedback.textContent='読み込めません：'+e.message+'。別のファイルを選ぶか、貼り付け欄を編集してください'}finally{if(active()&&request===reading){filePending=false;updateSave()}}
 };
 button.onclick=async()=>{
  if(busy||originalImportSaving||filePending||fileBlocked)return;
  let parsed;const exam=examInput.value.trim();try{parsed=LoopQOriginal.parse(input.value);if(!exam||exam==='その他')throw Error('資格名を入力してください')}catch(e){feedback.textContent='保存できません：'+e.message;return}
  busy=true;originalImportSaving=true;reading++;button.disabled=true;input.disabled=true;fileInput.disabled=true;examInput.disabled=true;
  try{const rows=await LoopQOriginal.records(parsed,exam),saved=await persistOriginal(rows);originalDraft='';settings.exam=exam;try{saveSettings()}catch{}
   if(active()){if(saved.some(r=>r.questions.some(isPracticeQuestion)))await startQuiz(saved);else{navigate('detail',saved[0].id);message('原文を保存しました。正答未確認のため、採点する復習には出しません')}}else message(parsed.questions.length+'問の原文を保存しました。問題集から開けます');
  }catch(e){if(active())feedback.textContent='保存できません：'+(e.name==='ConstraintError'?'同じ原文は取り込み済みです。既存の学習履歴は変更していません':e.message)}finally{busy=false;originalImportSaving=false;updateSave();input.disabled=false;fileInput.disabled=false;examInput.disabled=false}
 };
 inspect();
}

function renderHandoff(r){const pending=pendingSources();renderBatchHandoff(pending.some(x=>x.id===r.id)?pending:[r])}
const JSON_OUTPUT_INSTRUCTIONS="回答は全体を1つのjsonコードブロック（開始行は```json、終了行は```）に入れてください。コードブロックの外に説明文は付けないでください。中身はJSON.parseで読み取れるJSONオブジェクトにしてください。配列は必ず半角の角括弧 [ ]、オブジェクトは { }、キーと文字列は半角の二重引用符を使ってください。括弧をバックスラッシュでエスケープしないでください。丸括弧・数式表記・LaTeX・DIL表記で配列を表さないでください。末尾のカンマやコメントは禁止です。文字列内の二重引用符・改行・バックスラッシュはJSONの規則でエスケープしてください。送信前に括弧の対応、各写真3問、sourceId、answerが真偽値であることを確認してください。";
function batchPrompt(sources){
 const sample={statement:'具体的な条件を含む問題文',answer:true,explanation:'正誤の理由',reference:'実際に確認した一次資料・条文・適用時点。未確認なら未確認',trap:'要点'};
 const output=sources.length===1?{sourceId:sources[0].id,questions:[sample,{...sample,answer:false},sample]}:{sets:sources.map(r=>({sourceId:r.id,questions:[sample,{...sample,answer:false},sample]}))};
 return `あなたは資格試験の応用問題を作る作問者です。元問題写真は${sources.length}枚です。写真は1枚のまとめ画像、または元写真の個別添付で渡されます。依頼は新しい類題の作成です。作業の選択肢や開始確認は不要です。各写真を独立した出題元として、写真ごとに厳密に3問、合計${sources.length*3}問の新しい○×問題を作ってください。
対象写真：
${sources.map((r,i)=>`${i+1}枚目：sourceId=${r.id}／資格=${r.exam}${r.topic?'／メモ='+r.topic:''}`).join('\n')}
写真の対応方法：ID付きまとめ画像では各写真の表示IDを「対象写真」と照合してください。画像にIDがない場合（元写真の個別添付を含む）は、添付順（まとめ画像なら上から順）を「対象写真」の1枚目、2枚目…に対応させてください。画像内にIDがないことだけを理由に停止したり、IDの追記・再添付・対応順の再確認を求めたりせず、作成を進めてください。回答のsourceIdは必ずこの指示文の「対象写真」から一文字も変えずコピーし、IDを新しく作ったり過去の回答から流用したりしないでください。写真間の論点を混在させないでください。画像にIDが実際に表示されているのに対象写真のIDと矛盾する場合、元問題写真の枚数が不足する場合、問題文が読み取れない場合に限り、該当する写真と理由を示して停止してください。IDの表示がない場合と、表示されたIDが矛盾する場合を区別してください。
元の文章・選択肢・固有の事例・配置を再利用せず、独立した別の事例を作成してください。難しさは元問題以上とし、各問に当事者・時期・数値・例外等の複数条件を含め、定義確認で水増ししないでください。
法律系は試験年度と法令基準日を確認してください。未指定なら適用時点を明示し、特定年度向けの確認済みとはしないでください。法令・公的な一次資料で実際に確認した根拠のみ記載し、未確認は未確認と明記してください。各正答を独立に再検証し、疑問があれば作り直してください。
${JSON_OUTPUT_INSTRUCTIONS}
${sources.length===1?'写真1枚の完成した回答は、最上位をsourceIdとquestionsの2項目だけにしてください。':'複数写真の完成した回答は、最上位をsetsだけにし、各セットにsourceIdとquestionsを指定してください。'}確認中などの途中の返信（status・message）は完成した回答として出力しないでください。
次のJSONは構造の見本です。問題文等は実際の内容に置き換え、キー・sourceIdは変更しないでください。各設問の5項目はstatement・answer・explanation・reference・trapです。answerはtrue/false、残りの4項目は文字列。各写真のquestionsは厳密に3問です。
${JSON.stringify(output)}`;
}
async function prepareShareImage(sources){
 const load=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('共有用の写真を読み込めません'));img.src=LoopQSafety.safeImage(src)});
 const dims=[];
 for(const r of sources){if(!r.image)throw Error('元画像のない写真があります。元写真をChatGPTへ手動で添付してください');const img=await load(r.image);const scale=Math.min(1,1600/img.naturalWidth);dims.push({w:Math.round(img.naturalWidth*scale),h:Math.round(img.naturalHeight*scale)});img.src=''}
 const width=Math.max(800,...dims.map(d=>d.w)),height=dims.reduce((n,d)=>n+d.h+70,0);
 if(width*height>20_000_000)throw Error('まとめ画像が大きすぎます。枚数を減らしてください');
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw Error('この端末ではまとめ画像を作れません');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);let y=0;
 for(let i=0;i<sources.length;i++){ctx.fillStyle='#102c40';ctx.font='24px sans-serif';ctx.fillText('写真 '+(i+1)+' / ID '+sources[i].id,18,y+44,width-36);y+=70;const img=await load(sources[i].image);ctx.drawImage(img,0,y,dims[i].w,dims[i].h);img.src='';y+=dims[i].h}
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));canvas.width=canvas.height=1;if(!blob)throw Error('共有画像を作れません');return {file:new File([blob],'loopq-'+sources.length+'-photos.jpg',{type:'image/jpeg'})};
}
function renderBatchHandoff(sources){
 if(!sources.length||sources.length>LoopQBatch.MAX_PHOTOS){message('写真は1〜5枚で指定してください');return}
 const ids=sources.map(r=>r.id),prompt=batchPrompt(sources);
 frame(`<div class="page-heading"><h1 class="page-title">${sources.length}枚から${sources.length*3}問を作る</h1></div><div class="card batch-flow" id="batch-flow"><div id="batch-fallback" class="transfer-tools"><div class="button-group"><button id="copy-prompt" class="btn primary">① 指示文をコピー</button><button id="export-batch" class="btn primary" disabled>② 写真まとめを保存</button><a class="btn primary" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">③ ChatGPTを開く</a></div><p class="smalltext">ChatGPTで指示文を貼り付け、保存した写真まとめを添付して送信。回答のコードブロックにあるコピーボタンを押して、この画面へ戻ってください。</p><button type="button" id="show-prompt" class="btn ghost sm" aria-expanded="false" aria-controls="prompt-details">指示文を見る・手動コピー</button><div id="prompt-details" hidden><label for="handoff-prompt">ChatGPTに送る指示文</label><textarea id="handoff-prompt" rows="6" readonly></textarea></div></div><details class="details"><summary>端末の共有を使う（任意）</summary><button id="share-batch" class="btn teal" disabled>共有画像を準備中…</button></details><p class="smalltext" id="share-feedback" role="status">①→②→③の順に進めてください。写真はChatGPTの添付ボタンから選びます。元写真を個別に添付する場合は、指示文の対象写真と同じ順にしてください。</p><div class="field"><label for="generated-json">ChatGPTの回答</label><textarea id="generated-json" rows="3" maxlength="150000" placeholder="ChatGPTのjsonコードブロックをコピーして貼り付け"></textarea></div><button id="paste-json" class="btn ghost sm">クリップボードから貼り付け</button><p id="handoff-feedback" class="smalltext" role="status" aria-live="polite"></p><details class="details" id="batch-preview"><summary id="batch-preview-title">写真との対応・内容を見る</summary><div id="json-preview"></div></details><p class="smalltext">AI問題は未検証です。初回の利用確認は保存済みです。</p><button class="btn ghost sm" data-go="original">元の問題を改題せず取り込む</button><div class="flow-actions"><button class="btn ghost" data-go="home">ホーム</button><button class="btn primary" id="accept-json">保存して解く</button></div></div>`);
 const panel=document.getElementById('batch-flow'),input=document.getElementById('generated-json'),accept=document.getElementById('accept-json'),feedback=document.getElementById('handoff-feedback'),shareInfo=document.getElementById('share-feedback'),fallback=document.getElementById('prompt-details');let parsed=null,checkedText=null,busy=false,shareFile=null,shareBusy=false;
 const promptField=document.getElementById('handoff-prompt');promptField.value=prompt;fallback.hidden=true;
 const showPrompt=document.getElementById('show-prompt');
 function revealPrompt(){fallback.hidden=false;showPrompt.setAttribute('aria-expanded','true');showPrompt.textContent='指示文を閉じる';promptField.scrollIntoView({block:'nearest'})}
 showPrompt.onclick=()=>{if(fallback.hidden)revealPrompt();else{fallback.hidden=true;showPrompt.setAttribute('aria-expanded','false');showPrompt.textContent='指示文を見る・手動コピー'}};
 const enabled=()=>{accept.disabled=busy};
 function inspect(){
  parsed=null;checkedText=null;const preview=document.getElementById('json-preview');preview.replaceChildren();
  try{parsed=LoopQBatch.parse(input.value,ids);checkedText=input.value;feedback.textContent=sources.length+'枚・'+sources.length*3+'問を読み取れました。'+parsed.notes.join('。');document.getElementById('batch-preview-title').textContent='写真との対応・全'+sources.length*3+'問を確認';
   parsed.sets.forEach((set,i)=>{const box=document.createElement('section'),label=document.createElement('strong');label.textContent='写真'+(i+1)+' / '+set.sourceId;box.append(label);if(sources[i].image){const img=document.createElement('img');img.src=LoopQSafety.safeImage(sources[i].image);img.className='batch-source-thumb';img.alt='写真'+(i+1);box.append(img)}for(const [n,q] of set.questions.entries()){const text=document.createElement('p');text.className='batch-question';text.textContent=(n+1)+'. '+q.statement+'\n正しい答え：'+(q.answer?'○':'×')+'\n解説：'+q.explanation+'\n出典：'+q.reference+'\n要点：'+q.trap;box.append(text)}preview.append(box)});
  }catch(e){feedback.textContent=input.value?'保存できません：'+e.message+'（学習履歴は変更していません）':''}enabled();
 }
 input.addEventListener('input',inspect);input.addEventListener('change',inspect);
 document.getElementById('paste-json').onclick=async()=>{try{const text=await navigator.clipboard.readText();if(document.getElementById('batch-flow')!==panel)return;input.value=text;inspect()}catch{if(document.getElementById('batch-flow')!==panel)return;feedback.textContent='自動貼り付けが使えません。回答欄を長押しして貼り付けてください';input.focus()}};
 document.getElementById('copy-prompt').onclick=async()=>{try{await navigator.clipboard.writeText(prompt);shareInfo.textContent='指示文をコピーしました。次に「② 写真まとめを保存」を押してください'}catch{revealPrompt();promptField.select();shareInfo.textContent='指示文を選択しました。手動でコピーしてください'}};
 prepareShareImage(sources).then(bundle=>{if(document.getElementById('batch-flow')!==panel)return;shareFile=bundle.file;document.getElementById('export-batch').disabled=false;const button=document.getElementById('share-batch');button.disabled=false;button.textContent='端末の共有を使う（任意）'}).catch(e=>{if(document.getElementById('batch-flow')!==panel)return;document.getElementById('share-batch').textContent='共有画像を準備できません';shareInfo.textContent=e.message});
 document.getElementById('share-batch').onclick=()=>{
  if(!shareFile||shareBusy)return;
  if(typeof navigator.share!=='function'||(navigator.canShare&&!navigator.canShare({files:[shareFile]}))){revealPrompt();shareInfo.textContent='この端末ではまとめ共有に対応していません。指示文コピーと写真まとめ保存を使ってください';return}
  shareBusy=true;
  try{navigator.share({files:[shareFile],text:prompt,title:'LoopQ '+sources.length+'枚の元問題'}).then(()=>{shareInfo.textContent='ChatGPTで写真と指示文が届いたことを確認してください。回答をコピーしてこの欄に貼ると、まとめて保存できます'}).catch(e=>{if(e.name!=='AbortError'){revealPrompt();shareInfo.textContent='共有できません：'+e.message}}).finally(()=>shareBusy=false)}catch(e){shareBusy=false;revealPrompt();shareInfo.textContent='共有できません：'+e.message}
 };
 document.getElementById('export-batch').onclick=()=>{if(!shareFile)return;const url=URL.createObjectURL(shareFile),a=document.createElement('a');a.href=url;a.download=shareFile.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);shareInfo.textContent='写真まとめの保存を開始しました。保存先を確認し、「③ ChatGPTを開く」で指示文を貼り付け、写真を添付してください'};
 accept.onclick=async()=>{
  if(busy)return;
  if(settings.aiUseNoticeVersion!==1){onboarding();return}
  try{parsed=LoopQBatch.parse(input.value,ids);checkedText=input.value}catch(e){feedback.textContent=input.value?'保存できません：'+e.message+'（学習履歴は変更していません）':'ChatGPTの回答を先に貼り付けてください';feedback.scrollIntoView({block:'nearest'});input.focus();return}
  busy=true;enabled();input.disabled=true;
  try{
   const verified=LoopQBatch.parse(input.value,ids),saved=await persistQuestions(verified.sets);
   settings.pendingSourceIds=(Array.isArray(settings.pendingSourceIds)?settings.pendingSourceIds:[]).filter(id=>!ids.includes(id));try{saveSettings()}catch{}
   if(document.getElementById('batch-flow')===panel)await startQuiz(saved);else message(saved.length*3+'問を保存しました。ホームから復習できます');
  }catch(e){feedback.textContent='一括保存できません：'+e.message+'。既存の類題・学習履歴は変更していません'}finally{busy=false;input.disabled=false;enabled()}
 };
}

async function processImage(file){if(file.size>18*1024*1024)throw Error('画像は18MB以下にしてください');return new Promise((res,rej)=>{const fr=new FileReader();fr.onerror=()=>rej(new Error('ファイル読込失敗'));fr.onload=()=>{const i=new Image();i.onload=()=>{const w=i.naturalWidth,h=i.naturalHeight,scale=Math.min(1,2048/Math.max(w,h)),c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.86))};i.onerror=()=>rej(Error('この画像形式は対応していません'));i.src=fr.result};fr.readAsDataURL(file)})}
async function generate(r){throw new Error('ChatGPTアカウントによる本人負担のAI生成機能は接続準備中です。運営者のAPIへの自動切替は行いません。')}
function pageControls(page,total){return `<div class="page-controls"><button id="page-prev" class="btn ghost sm" ${page===0?'disabled':''}>前へ</button><span>${page+1} / ${total}</span><button id="page-next" class="btn ghost sm" ${page>=total-1?'disabled':''}>次へ</button></div>`}
function mountPhotos(){document.querySelectorAll('[data-photo]').forEach(node=>{const r=records.find(r=>r.id===node.dataset.photo);if(!r?.image)return;const img=document.createElement('img');img.src=LoopQSafety.safeImage(r.image);img.alt='保存した元問題';img.className=node.dataset.full?'detail-photo':'photo-thumb';node.append(img)})}
async function changePhoto(id,restore=false){
 if(photoBusy.has(id))return;const r=records.find(x=>x.id===id);if(!r)return;
 const previous=r.image,image=restore?removedPhotos.get(id):null;if(restore&&!image)return;
 photoBusy.add(id);
 try{await persist({...r,image});if(restore)removedPhotos.delete(id);else if(previous)removedPhotos.set(id,previous);library();message(restore?'画像を戻しました':'画像だけを削除しました。取り消しできます')}catch(e){message('画像を変更できません：'+e.message)}finally{photoBusy.delete(id)}
}
function library(){
 const all=filter==='all'?records:filter==='weak'?records.filter(r=>r.weak||(r.questions||[]).some(q=>q.weak)):records.filter(r=>r.exam===filter),exams=[...new Set(records.map(r=>r.exam))],total=Math.max(1,Math.ceil(all.length/2));libraryPage=Math.min(libraryPage,total-1);
 frame(`<div class="page-heading"><h1 class="page-title">マイ問題集</h1><button class="btn primary sm" data-go="capture">問題を追加</button></div><div class="field compact-filter"><label for="library-filter">表示</label><select id="library-filter">${[{k:'all',v:'すべて'},{k:'weak',v:'苦手だけ'},...exams.map(x=>({k:x,v:x}))].map(x=>`<option value="${escape(x.k)}" ${filter===x.k?'selected':''}>${escape(x.v)}</option>`).join('')}</select><span class="smalltext">${all.length}セット</span></div><div class="source-grid">${all.slice(libraryPage*2,libraryPage*2+2).map(sourceCard).join('')||'<p>保存した問題はありません。</p>'}</div>${pageControls(libraryPage,total)}`);
 document.getElementById('library-filter').onchange=e=>{filter=e.target.value;libraryPage=0;library()};
 document.getElementById('page-prev').onclick=()=>{libraryPage--;library()};document.getElementById('page-next').onclick=()=>{libraryPage++;library()};
 document.querySelectorAll('[data-delete-photo]').forEach(b=>b.onclick=()=>changePhoto(b.dataset.deletePhoto));document.querySelectorAll('[data-undo-photo]').forEach(b=>b.onclick=()=>changePhoto(b.dataset.undoPhoto,true));mountPhotos();wireDetailButtons();wireReviewButtons();
}
function sourceCard(r){const n=r.questions?.length||0;return `<article class="source-card"><div class="source-top"><span data-photo="${escape(r.id)}"></span><div class="list-text"><span class="exam-chip">${escape(r.exam)}</span><h3>${escape(r.title)}</h3><small>${date(r.createdAt)} · ${n}問</small></div></div><div class="source-buttons"><button class="btn sm ghost" data-detail="${escape(r.id)}">開く</button>${r.questions?.some(isPracticeQuestion)?`<button class="btn sm primary" data-review="${escape(r.id)}">${setResumeLabel(r)}</button>`:''}${r.image?`<button class="btn danger sm" data-delete-photo="${escape(r.id)}">画像を削除</button>`:removedPhotos.has(r.id)?`<button class="btn teal sm" data-undo-photo="${escape(r.id)}">画像削除を取り消す</button>`:'<span class="smalltext">画像なし</span>'}</div></article>`}

function detail(id){
 const r=records.find(x=>x.id===id);if(!r){navigate('library');return}
 frame(`<div class="page-heading"><h1 class="page-title">問題セット</h1><button class="btn ghost sm" data-go="library">一覧へ</button></div><p class="smalltext">${escape(r.exam)} · ${escape(r.title)}</p><div class="segmented"><button class="btn primary" id="tab-questions">${r.original?'原文':'類題'}（${r.questions.length}問）</button><button class="btn ghost" id="tab-photo">元画像</button></div><div id="detail-questions" class="card"><div class="question-list">${r.questions.map((q,i)=>r.original?`<details class="original-question-detail"><summary>${escape(q.originalId||String(i+1))}. ${escape(q.statement.slice(0,60))}${q.statement.length>60?'…':''}${isPracticeQuestion(q)?'':' 正答未確認（出題対象外）'}</summary><p>${escape(q.statement)}</p><p>正答：${isPracticeQuestion(q)?(q.answer?'○':'×'):'未確認'}</p><p>${escape(q.explanation||'解説の記載なし')}</p><p class="smalltext">${escape(q.reference)}${q.sourcePage?' / 元資料 '+q.sourcePage+'ページ':''}</p></details>`:`<p>${escape(q.originalId||String(i+1))}. ${escape(q.statement.slice(0,60))}${q.statement.length>60?'…':''}${isPracticeQuestion(q)?'':' <strong>正答未確認（出題対象外）</strong>'}</p>`).join('')||'<p>類題はまだありません。</p>'}</div><div class="button-group">${r.questions.some(isPracticeQuestion)?'<button id="quiz-source" class="btn primary">'+(setResumeLabel(r)==='解く'?(r.original?'原文':'類題')+'を解く':setResumeLabel(r))+'</button>':r.original?'<p>正答が未確認のため、採点する復習には出しません。</p>':'<button id="open-handoff" class="btn primary">類題を3問作る</button>'}<button id="weak-toggle" class="btn ghost">${r.weak?'苦手登録を解除':'苦手に登録'}</button></div></div><div id="detail-image" class="card" hidden><div data-photo="${escape(r.id)}" data-full="true"></div>${r.image?'':'<p>画像なし</p>'}${r.topic?`<p class="smalltext">${escape(r.topic)}</p>`:''}<button class="btn danger sm" id="delete-source">セット全体を削除</button></div><p class="smalltext">${r.original?'元資料から転記した原文・正答です。内容・法令は未検証です。'+escape(r.original.sourceFile):'AI問題の正答・出典は一次資料で確認してください。'}</p><div id="handoff-panel"></div>`);
 const tab=photo=>{document.getElementById('detail-image').hidden=!photo;document.getElementById('detail-questions').hidden=photo;document.getElementById('tab-photo').className='btn '+(photo?'primary':'ghost');document.getElementById('tab-questions').className='btn '+(photo?'ghost':'primary')};
 document.getElementById('tab-photo').onclick=()=>tab(true);document.getElementById('tab-questions').onclick=()=>tab(false);mountPhotos();
 document.getElementById('weak-toggle').onclick=async()=>{try{await persist({...r,weak:!r.weak});detail(id)}catch(e){message('保存できません：'+e.message)}};
 document.getElementById('delete-source').onclick=async()=>{if(confirm('画像・類題・学習履歴をすべて削除しますか？')){try{await remove(id);removedPhotos.delete(id);navigate('library')}catch(e){message('削除できません：'+e.message)}}};
 document.getElementById('quiz-source')?.addEventListener('click',()=>startQuiz([r]));document.getElementById('open-handoff')?.addEventListener('click',()=>renderHandoff(r));
}

function handoffPrompt(r){return `あなたは資格試験の応用問題を作る作問者です。ユーザーがこのチャットに添付する試験問題の写真から、論点と難易度を分析し、元の文章・選択肢・固有の事例・配置を再利用せず、独立した新しい○×問題を厳密に3問作ってください。\n\n【資格】${r.exam}\n【メモ】${r.topic||'なし'}\n【元問題のタイトル】${r.title}\n\n必須条件：\n・元問題と同じ水準以上の難しさ。基礎的な定義確認で水増ししない。\n・各問に具体的な事例、例外、数字、時期、当事者など複数条件を含める。\n・元問題の創作的表現をコピーしたり、軽く言い換えたりしない。\n・正答と、誤りの理由が分かる解説を付ける。\n・法律系は適用される試験年度の施行法令を確認し、未確認の根拠は推測して書かない。\n・各問について正答をもう一度独立に検証し、疑問があれば作り直す。\n・${JSON_OUTPUT_INSTRUCTIONS}\n\n{\"questions\":[{\"statement\":\"問題文\",\"answer\":true,\"explanation\":\"解説\",\"reference\":\"実際に確認できた法令・公的出典名と条文（未確認なら未確認）\",\"trap\":\"ひっかけの要点\"},{\"statement\":\"問題文\",\"answer\":false,\"explanation\":\"解説\",\"reference\":\"確認できた根拠または未確認\",\"trap\":\"要点\"},{\"statement\":\"問題文\",\"answer\":true,\"explanation\":\"解説\",\"reference\":\"根拠\",\"trap\":\"要点\"}]}\n\nこのチャットに写真が実際に添付されていることを確認してから生成してください。画像が見えない場合は問題を生成せず、写真の添付を依頼してください。`}
function cleanPastedQuestions(value){
 return LoopQPastedJSON.parse(value).questions.map(q=>({...q,id:uid(),attempts:0,correct:0,weak:false}));
}
function photoAsFile(src, id){
 const safe=LoopQSafety.safeImage(src);
 if(!safe)throw Error('保存画像が見つかりません');
 const m=/^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(safe);
 if(!m)throw Error('この写真形式では共有できません');
 const bin=atob(m[2]),out=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
 const ext=m[1]==='jpeg'?'jpg':m[1];
 return new File([out],`loopq-question-${id}.${ext}`,{type:`image/${m[1]}`});
}
async function setupLocalAI(panel, r){
  const target=panel.querySelector('#ai-local-card');
  if(!target||!window.LoopQAI?.enabled)return;
  const manual=panel.querySelector('.handoff-card');
  if(manual){
    const wrapper=document.createElement('details');wrapper.className='manual-fallback';
    const toggle=document.createElement('summary');toggle.textContent='手動でChatGPTに送る（接続できない場合）';
    manual.before(wrapper);wrapper.append(toggle,manual);
  }
  target.hidden=false;
  target.innerHTML='<h4>PC版・自分のChatGPTで生成</h4><p>接続状態を確認しています...</p>';
  try{
    const state=await window.LoopQAI.status();
    if(!state.connected){
      target.innerHTML='<h4>本人のChatGPTを接続</h4><p>PC版のローカル実行環境だけで使用します。本人の利用枠が上限に達したら生成を停止し、運営者の有料APIには切り替えません。</p><button class="btn primary" id="ai-connect">ChatGPTに接続する</button><p id="ai-message" class="smalltext"></p>';
      const b=target.querySelector('#ai-connect');
      b.onclick=async()=>{b.disabled=true;try{await window.LoopQAI.connect();target.querySelector('#ai-message').textContent='開いた認証画面で許可してください。認証後、この画面を再読込してください。'}catch(e){target.querySelector('#ai-message').textContent=e.message}finally{b.disabled=false}};
      return;
    }
    const modelData=await window.LoopQAI.models();
    const models=Array.isArray(modelData.models)?modelData.models:[];
    if(!models.length){target.innerHTML='<h4>ChatGPT接続済み</h4><p>利用可能なモデルを取得できませんでした。接続と利用枠を確認してください。</p>';return;}
    target.innerHTML='<h4>✦ 同じ難易度の類題を3問作成</h4><p>ChatGPT接続済み：'+escape(state.account||'自分のアカウント')+'。モデルを選択し、写真の送信に同意して生成してください。</p><label class="smalltext" for="ai-model">使用するモデル</label><select id="ai-model">'+models.map(m=>'<option value="'+escape(m.slug)+'">'+escape(m.name)+'</option>').join('')+'</select><label class="toggle-line"><input type="checkbox" id="ai-consent"><span>この写真をOpenAIに送信し、自分のChatGPT利用枠を使って作問・再検証することに同意する</span></label><div class="button-group"><button class="btn primary" id="ai-generate">写真から3問を生成する</button></div><p class="smalltext" id="ai-message">生成後も法令の正確性は自分で確認する必要があります。</p>';
    target.querySelector('#ai-generate').onclick=async()=>{
      const info=target.querySelector('#ai-message'),btn=target.querySelector('#ai-generate');
      if(!r.image){info.textContent='この問題セットには写真がありません。写真を追加してから実行してください。';return;}
      if(!target.querySelector('#ai-consent').checked){info.textContent='写真送信への同意が必要です。';return;}
      btn.disabled=true;info.textContent='論点を分析し、3問を作成して別工程で検証しています...';
      try{
        const result=await window.LoopQAI.generate({model:target.querySelector('#ai-model').value,image:r.image,exam:r.exam,topic:r.topic,consent:true});
        const incoming=cleanPastedQuestions(JSON.stringify({questions:result.questions}));
        if(r.questions.length&&!confirm('既存の問題を置き換えますか？学習履歴は失われます。'))return;
        r.questions=incoming;r.status='review_required';await persist(r);
        message('類題3問を保存しました。法令・出典は未検証です。');detail(r.id);
      }catch(e){info.textContent='生成できませんでした：'+e.message}
      finally{btn.disabled=false;}
    };
  }catch(e){target.innerHTML='<h4>ChatGPT接続の確認に失敗</h4><p>'+escape(e.message)+'</p>';}
}

function wireReviewButtons(){document.querySelectorAll('[data-review]').forEach(x=>x.onclick=()=>{const r=records.find(y=>y.id===x.dataset.review);if(r)startQuiz([r])})}
function review(){const stats=getStats(),available=records.filter(r=>r.questions?.some(isPracticeQuestion)),weak=available.filter(r=>r.questions.some(q=>isWeakQuestion(q,r)));frame(`<h1 class="page-title">復習</h1>${resumeList()}<p class="smalltext">解答 ${stats.answers}回 · 正答率 ${stats.accuracy}%</p><div class="review-actions"><button class="btn primary" id="weak-review" ${weak.length?'':'disabled'}>苦手に挑戦（${stats.weak}問）</button><button class="btn ghost" id="all-review" ${available.length?'':'disabled'}>総復習（${stats.playable}問）</button></div>${available.length?'':'<p class="smalltext">先に元問題を追加して、類題を作ってください。</p>'}`);document.getElementById('weak-review').onclick=()=>startQuiz(weak,true,'weak');wireResumeButtons();document.getElementById('all-review').onclick=()=>startQuiz(available,false,'all')}

function resumeSessions(){return quizSessions.map(s=>LoopQProgress.clean(s,records)).filter(Boolean).sort((a,b)=>(b.updatedAt||'').localeCompare(a.updatedAt||''))}
async function refreshQuizSessions(){quizSessions=await LoopQProgress.read(db)}
function rememberQuiz(session){quizSessions=quizSessions.filter(x=>x.id!==session.id);quizSessions.push(session);return session}
function quizRuntime(session){session.picked=session.answers[session.index]?.picked??null;session.sessionCorrect=session.answers.filter(a=>a?.correct).length;return session}
function quizCheckpoint(session){const {picked,sessionCorrect,saving,readyAt,...data}=session;return data}
async function saveQuiz(session,kind='position'){return LoopQProgress.save(db,STORE,quizCheckpoint(session),kind)}
async function commitQuizAnswer(session,value){return LoopQProgress.answer(db,STORE,quizCheckpoint(session),value,gradeQuestion)}
async function deleteQuiz(session){return LoopQProgress.remove(db,STORE,session)}
function resumeList(){const sessions=resumeSessions();return sessions.length?`<section class="resume-quizzes" aria-label="途中の復習"><h2>続きから解く</h2>${sessions.map(s=>`<div class="resume-quiz-row"><div><strong>${escape(s.title)}</strong><p class="smalltext">${LoopQProgress.count(s)} / ${s.pool.length}問 解答済み · ${s.index+1}問目から</p></div><button class="btn primary sm" data-resume-quiz="${escape(s.id)}">再開</button></div>`).join('')}<p class="smalltext">進み具合はこの端末に自動保存されます。</p></section>`:''}
function wireResumeButtons(){document.querySelectorAll('[data-resume-quiz]').forEach(b=>b.onclick=()=>resumeQuiz(b.dataset.resumeQuiz))}
function setResumeLabel(r){const s=resumeSessions().find(x=>x.id===LoopQProgress.key([r]));return s?'続きから（'+LoopQProgress.count(s)+' / '+s.pool.length+'問）':'解く'}
async function resumeQuiz(id){
 if(quizBusy||quiz?.saving)return;const originHash=location.hash,originVersion=navigationVersion;quizBusy=true;
 try{await refresh();await refreshQuizSessions();const saved=quizSessions.find(s=>s.id===id),session=LoopQProgress.clean(saved,records);if(!session){message('続きの問題が削除・変更されています。問題集から新しく始めてください');render();return}const next=await saveQuiz(session);rememberQuiz(next);if(location.hash===originHash&&navigationVersion===originVersion)navigate('quiz',quizRuntime(next));if(saved.pool.length!==next.pool.length)message('削除・変更された問題を除いて再開しました')}
 catch(e){message('続きから開けません：'+e.message)}finally{quizBusy=false}
}
async function startQuiz(sets,weakOnly=false,mode='sets',restart=false){
 if(quizBusy||quiz?.saving)return;const originHash=location.hash,originVersion=navigationVersion,requestedIds=sets.map(r=>r.id);quizBusy=true;
 try{
  await refresh();await refreshQuizSessions();sets=requestedIds.map(id=>records.find(r=>r.id===id)).filter(Boolean);
  if(mode==='all'||mode==='weak')sets=records.filter(r=>(r.questions||[]).some(isPracticeQuestion));
  const id=LoopQProgress.key(sets,weakOnly,mode),raw=quizSessions.find(s=>s.id===id),existing=LoopQProgress.clean(raw,records);
  if(existing&&!restart){const saved=await saveQuiz(existing);rememberQuiz(saved);if(location.hash===originHash&&navigationVersion===originVersion)navigate('quiz',quizRuntime(saved));return}
  let pool=sets.flatMap(r=>(r.questions||[]).filter(q=>isPracticeQuestion(q)&&(!weakOnly||isWeakQuestion(q,r))).map(q=>({setId:r.id,qid:q.id,fingerprint:LoopQProgress.fingerprint(q)})));
  if(!pool.length){message('復習できる問題がありません');return}
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]]}
  const next=LoopQProgress.create(sets,weakOnly,mode,pool,uid());if(restart||raw)next.previousToken=restart?quiz?.token:raw.token;
  const saved=await saveQuiz(next,restart||raw?'restart':'start'),cleaned=LoopQProgress.clean(saved,records);
  if(!cleaned)throw Error('問題が変更されています。ホームを開き直してください');rememberQuiz(cleaned);
  if(location.hash===originHash&&navigationVersion===originVersion)navigate('quiz',quizRuntime(cleaned));else message('復習の続きはホームから開けます');
 }catch(e){message('進み具合を保存できないため開始できません：'+e.message)}finally{quizBusy=false}
}
function resultDock(done,last){return `<div class="thumb-dock quiz-dock" aria-label="解答と問題の移動"><div class="answer-grid"><button id="ans-true" class="answer-choice" ${done?'disabled':''}>○ 正しい</button><button id="ans-false" class="answer-choice" ${done?'disabled':''}>× 誤り</button></div><div class="quiz-navigation"><button id="previous" class="btn ghost" ${quiz.index===0?'disabled':''}>← 前の問題</button><button id="next" class="btn primary" ${done?'':'disabled'}>${last?'終了してホーム':'次の問題 →'}</button></div></div>`}
async function moveQuiz(delta,expectedToken,expectedIndex){
 const session=quiz;if(!session||session.saving||quizBusy||session.token!==expectedToken||session.index!==expectedIndex||Date.now()<(session.readyAt||0))return;
 if(delta>0&&!session.answers[session.index])return;if(delta<0&&session.index===0)return;
 if(session.index+delta>=session.pool.length)return results();
 session.saving=true;try{const saved=await saveQuiz({...session,index:session.index+delta});rememberQuiz(saved);if(quiz===session){quiz=quizRuntime(saved);quiz.readyAt=Date.now()+300;if(route==='quiz')quizPage()}}catch(e){message('移動を保存できません：'+e.message)}finally{session.saving=false}
}
function quizPage(){
 if(!quiz?.pool?.length){navigate('review');return}
 const cleaned=LoopQProgress.clean(quiz,records);if(!cleaned){quiz=null;navigate('review');message('復習できる問題がなくなりました');return}
 Object.assign(quiz,cleaned);quizRuntime(quiz);
 const cur=quiz.pool[quiz.index],r=records.find(x=>x.id===cur.setId),q=r.questions.find(x=>x.id===cur.qid),done=quiz.picked!==null,session=quiz,position=quiz.index;
 frame(`<div class="quiz-shell"><div class="quiz-head"><div><strong id="quiz-position" tabindex="-1">問題 ${quiz.index+1} / ${quiz.pool.length}</strong><p class="smalltext">${LoopQProgress.count(quiz)}問 解答済み · 自動保存</p></div><button id="quit" class="btn ghost sm">ホーム</button></div><div class="card quiz-card">${done?`<div class="answer-result ${quiz.picked===q.answer?'result-correct':'result-wrong'}" role="status">${quiz.picked===q.answer?'正解':'不正解'}</div><div class="answer-summary"><span>あなたの回答：${quiz.picked?'○':'×'}</span><span>正しい答え：${q.answer?'○':'×'}</span></div><div class="segmented"><button id="show-explanation" class="btn primary sm">解説</button><button id="show-question" class="btn ghost sm">問題文</button></div><div class="quiz-reading" tabindex="0" id="quiz-explanation"><p>${escape(q.explanation||(q.kind==='original'?'元資料に解説の記載はありません':''))}</p>${q.trap?`<p><b>要点：</b>${escape(q.trap)}</p>`:''}${q.reference?`<p class="smalltext">出典：${escape(q.reference)}</p>`:''}</div><div class="quiz-reading" tabindex="0" id="quiz-question" hidden><p class="question">${escape(q.statement)}</p></div><button id="mark-weak" class="btn ghost sm">${q.weak?'苦手登録を解除':'苦手に登録'}</button>`:`<p class="smalltext">${escape(r.exam)}${q.kind==='original'?' / 元問題 '+escape(q.originalId||'')+(q.sourcePage?' / '+q.sourcePage+'ページ':''):''}</p><div class="quiz-reading" tabindex="0"><p class="question">${escape(q.statement)}</p></div>`}</div><p class="smalltext">ホームへ戻っても、解答と続きは保存されます。</p><button id="restart-quiz" class="btn ghost sm">この復習を最初からやり直す</button>${resultDock(done,quiz.index===quiz.pool.length-1)}</div>`);
 const answerAt=value=>{if(quiz===session&&quiz.index===position)return answer(value)};
 document.getElementById('ans-true').onclick=()=>answerAt(true);document.getElementById('ans-false').onclick=()=>answerAt(false);
 document.getElementById('previous').onclick=()=>moveQuiz(-1,session.token,position);document.getElementById('next').onclick=()=>moveQuiz(1,session.token,position);
 if(done){
  const tab=question=>{document.getElementById('quiz-question').hidden=!question;document.getElementById('quiz-explanation').hidden=question;document.getElementById('show-question').className='btn sm '+(question?'primary':'ghost');document.getElementById('show-explanation').className='btn sm '+(question?'ghost':'primary')};document.getElementById('show-explanation').onclick=()=>tab(false);document.getElementById('show-question').onclick=()=>tab(true);
  document.getElementById('mark-weak').onclick=async()=>{if(session.saving)return;session.saving=true;try{const saved=await LoopQProgress.toggleWeak(db,STORE,r.id,q.id);records=records.map(r=>r.id===saved.id?saved:r);if(quiz===session&&route==='quiz')quizPage()}catch(e){message('保存できません：'+e.message)}finally{session.saving=false}};
 }
 document.getElementById('quit').onclick=()=>navigate('home');document.getElementById('restart-quiz').onclick=()=>{if(quiz!==session||session.saving||quizBusy)return;if(confirm('この復習の進み具合をリセットして、最初から解き直しますか？これまでの解答回数・苦手・習得履歴は残ります。'))startQuiz(session.setIds.map(id=>records.find(r=>r.id===id)).filter(Boolean),session.weakOnly,session.mode,true)};
}
function gradeQuestion(original,value){const q={...original};q.attempts=(q.attempts||0)+1;const today=new Date().toISOString().slice(0,10);
 if(value===q.answer){q.correct=(q.correct||0)+1;if(q.lastSuccessDay!==today){q.successDays=(q.successDays||0)+1;q.lastSuccessDay=today}if(q.successDays>=3){q.mastered=true;q.weak=false}}else{q.weak=true;q.mastered=false;q.successDays=0;q.lastSuccessDay=''}q.lastAnsweredAt=new Date().toISOString();return q}
async function answer(value){
 const session=quiz;if(!session||session.picked!==null||session.saving||quizBusy||Date.now()<(session.readyAt||0)||typeof value!=='boolean')return;
 const c=session.pool[session.index],r=records.find(x=>x.id===c.setId),original=r?.questions.find(x=>x.id===c.qid);if(!original||!isPracticeQuestion(original))return;
 session.saving=true;document.getElementById('ans-true').disabled=true;document.getElementById('ans-false').disabled=true;
 try{const saved=await commitQuizAnswer(session,value);records=records.map(r=>r.id===saved.record.id?saved.record:r);rememberQuiz(saved.session);if(quiz===session){quiz=quizRuntime(saved.session);if(route==='quiz')quizPage();else if(['home','review','library'].includes(route))render()}}
 catch(e){message('解答を保存できません：'+e.message);if(quiz===session&&route==='quiz')quizPage()}finally{session.saving=false}
}
async function results(){
 const session=quiz;if(!session||session.saving||quizBusy)return;session.saving=true;
 try{await deleteQuiz(session);const total=session.pool.length,correct=session.answers.filter(a=>a?.correct).length;quizSessions=quizSessions.filter(s=>s.id!==session.id);if(quiz===session)quiz=null;if(route==='quiz')navigate('home');else if(['home','review','library'].includes(route))render();message('今回の結果：'+correct+' / '+total+'問正解')}
 catch(e){message('終了を保存できません：'+e.message)}finally{session.saving=false}
}
function clearStudyData(){return new Promise((resolve,reject)=>{const tx=db.transaction([STORE,LoopQProgress.STORE],'readwrite');tx.objectStore(STORE).clear();tx.objectStore(LoopQProgress.STORE).clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('削除を中止しました'));tx.onerror=()=>reject(tx.error)})}
function restoreStudyData(rows){return new Promise((resolve,reject)=>{const tx=db.transaction([STORE,LoopQProgress.STORE],'readwrite'),sources=tx.objectStore(STORE),sessions=tx.objectStore(LoopQProgress.STORE),ids=new Set(rows.map(r=>r.id));for(const r of rows)sources.put(r);const req=sessions.getAll();req.onsuccess=()=>{for(const s of req.result)if(s.pool?.some(x=>ids.has(x.setId)))sessions.delete(s.id)};tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error||Error('復元を中止しました'));tx.onerror=()=>reject(tx.error)})}

function preferences(){
 frame(`<h1 class="page-title">設定</h1><div class="segmented"><button class="btn primary" id="settings-data">データ</button><button class="btn ghost" id="settings-about">このアプリについて</button></div><div class="card" id="data-pane"><h2>バックアップ</h2><p class="smalltext">画像・類題・学習履歴は、このブラウザ内に保存されます。写真アプリやドライブには自動保存されません。</p><p class="smalltext">サイトデータを削除すると消えます。必要なデータは書き出してください。</p><div class="button-group"><button id="export" class="btn primary">バックアップ保存</button><label class="btn ghost" for="import-file">復元する</label><input id="import-file" hidden type="file" accept="application/json,.json"></div><p class="smalltext">${records.length}セット / ${getStats().questions}問</p><button class="btn danger sm" id="erase">全データを削除</button></div><div class="card" id="about-pane" hidden><h2>LoopQ プレビュー版</h2><p>Web版の類題作成はChatGPTとの手動連携です。写真は自動送信されません。</p><p>AIの正答・法令・出典は、ご自身で一次資料を確認してください。</p><p class="smalltext">iPhone実機での検証は継続中です。</p></div>`);
 const tab=about=>{document.getElementById('data-pane').hidden=about;document.getElementById('about-pane').hidden=!about;document.getElementById('settings-data').className='btn '+(about?'ghost':'primary');document.getElementById('settings-about').className='btn '+(about?'primary':'ghost')};document.getElementById('settings-data').onclick=()=>tab(false);document.getElementById('settings-about').onclick=()=>tab(true);
 document.getElementById('export').onclick=backup;document.getElementById('import-file').onchange=importBackup;document.getElementById('erase').onclick=async()=>{if(!confirm('写真・全問題・解答履歴を完全に削除します。取り消せません。実行しますか？'))return;try{await clearStudyData();removedPhotos.clear();quizSessions=[];quiz=null;await refresh();message('学習データを削除しました');navigate('home')}catch(e){message('削除できません：'+e.message)}};
}

function saveSettings(){localStorage.setItem(SETTING,JSON.stringify(settings))}
function backup(){try{const parts=LoopQBackup.parts(records),box=document.createElement('div');box.className='card';const info=document.createElement('p');info.textContent=parts.length>1?'復元上限に合わせて分割しました。全ファイルを保存し、復元時は各ファイルを順に取り込んでください。':'下のリンクを押してバックアップを保存してください。';box.append(info);parts.forEach((blob,i)=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='loopq-backup-'+new Date().toISOString().slice(0,10)+'-part-'+(i+1)+'-of-'+parts.length+'.json';a.textContent='バックアップ '+(i+1)+' / '+parts.length+' を保存';a.className='btn ghost';a.onclick=()=>setTimeout(()=>URL.revokeObjectURL(url),60000);box.append(a)});document.getElementById('backup-downloads')?.remove();box.id='backup-downloads';el.append(box);message('バックアップの準備ができました')}catch(e){message('バックアップを作成できません：'+e.message)}}
async function importBackup(e){const file=e.target.files?.[0];if(!file)return;if(file.size>LoopQBackup.MAX_BYTES){message('バックアップのサイズが大きすぎます');return}try{const data=JSON.parse(await file.text());if(data.format!=='loopq.v2'||!Array.isArray(data.records))throw Error('形式が違います');if(data.records.length>10000)throw Error('件数が多すぎます');const cleaned=LoopQSafety.validateBackup(data);if(!confirm(`${cleaned.length}件のセットを端末に追加します。既存IDは上書きされます。よいですか？`))return;await restoreStudyData(cleaned);await refresh();await refreshQuizSessions();quiz=null;message('復元しました');navigate('home')}catch(err){message('復元できません：'+err.message)}}
function manual(){
 frame(`<h1 class="page-title">手動で問題を登録</h1><div class="card manual-card"><p id="manual-step-title" class="smalltext">1 / 2　問題文</p><section id="manual-first"><div class="field"><label for="manual-exam">試験・資格</label><select id="manual-exam">${EXAMS.map(x=>`<option ${x===settings.exam?'selected':''}>${escape(x)}</option>`).join('')}</select><label for="manual-custom-exam" class="smalltext">一覧にない場合は、資格名を入力してください</label><input id="manual-custom-exam" maxlength="60" placeholder="資格名（任意）" value="${EXAMS.includes(settings.exam)?'':escape(settings.exam)}"></div><div class="field"><label for="manual-statement">○×問題文</label><textarea id="manual-statement" rows="4" maxlength="1500"></textarea></div><button class="btn primary" id="manual-next">解答・解説へ →</button></section><section id="manual-second" hidden><div class="field"><label for="manual-answer">正しい答え</label><select id="manual-answer"><option value="true">○ 正しい</option><option value="false">× 誤り</option></select></div><div class="field"><label for="manual-explanation">解説</label><textarea id="manual-explanation" rows="5" maxlength="2000"></textarea></div><div class="button-group"><button class="btn ghost" id="manual-back">戻る</button><button class="btn primary" id="manual-save">問題を保存</button></div></section><p id="manual-feedback" class="smalltext" role="status"></p></div>`);
 const feedback=document.getElementById('manual-feedback'),step=n=>{document.getElementById('manual-first').hidden=n===1;document.getElementById('manual-second').hidden=n===0;document.getElementById('manual-step-title').textContent=n?'2 / 2　解答・解説':'1 / 2　問題文';feedback.textContent=''};
 document.getElementById('manual-next').onclick=()=>{if(!document.getElementById('manual-statement').value.trim()){feedback.textContent='問題文を入力してください';return}step(1)};document.getElementById('manual-back').onclick=()=>step(0);
 let busy=false;document.getElementById('manual-save').onclick=async()=>{
  if(busy)return;const statement=document.getElementById('manual-statement').value.trim(),explanation=document.getElementById('manual-explanation').value.trim(),exam=document.getElementById('manual-custom-exam').value.trim()||document.getElementById('manual-exam').value;
  if(!statement||!explanation||exam==='その他'){feedback.textContent='資格名・問題文・解説を確認してください';return}
  const r={id:uid(),exam,title:statement.slice(0,30),topic:'',image:null,createdAt:new Date().toISOString(),weak:false,status:'manual',questions:[{id:uid(),statement,answer:document.getElementById('manual-answer').value==='true',explanation,reference:'',trap:'',attempts:0,correct:0,weak:false}]};
  busy=true;document.getElementById('manual-save').disabled=true;try{await persist(r);message('保存しました');navigate('detail',r.id)}catch(e){feedback.textContent='保存できません：'+e.message;document.getElementById('manual-save').disabled=false}finally{busy=false}
 };
}
window.addEventListener('hashchange',()=>{navigationVersion++;render()});document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));document.getElementById('top-settings').onclick=()=>navigate('settings');document.getElementById('top-home').onclick=()=>navigate('home');
readDB().then(async x=>{db=x;await refresh();await refreshQuizSessions();render();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{})}).catch(e=>{el.innerHTML=`<div class="content"><div class="notice warn">保存機能を開始できませんでした。ブラウザのプライベートモード設定を確認してください：${escape(e.message)}</div></div>`});
})();

