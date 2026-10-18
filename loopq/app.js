/* LoopQ v2 — private-first learning library. No external JS dependencies. */
(()=>{'use strict';
const DB='loopq-library-v2', STORE='sources', SETTING='loopq-settings-v2';
const EXAMS=['賃貸不動産経営管理士','宅地建物取引士','行政書士','FP','簿記','社会保険労務士','その他'];
const el=document.getElementById('app'),toastEl=document.getElementById('toast');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>{try{return new Intl.DateTimeFormat('ja-JP',{year:'numeric',month:'short',day:'numeric'}).format(new Date(s))}catch{return '—'}};
const uid=()=>globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
const statDefault=()=>({answered:0,correct:0,updatedAt:null});
let db,records=[],route='home',filter='all',quiz=null,toastTimer;
let quizSessions=[],quizBusy=false,navigationVersion=0;
let originalDraft='',originalExam='',originalImportSaving=false;
let libraryPage=0;
let settings={exam:EXAMS[0]};try{settings=Object.assign(settings,JSON.parse(localStorage.getItem(SETTING)||'{}'))}catch{}
// Topic prompts are prepared locally; JSON is pasted back by the user. No AI API calls.
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
const sTitles={home:'ホーム',capture:'問題を作る',library:'マイ問題集',review:'苦手を復習',settings:'設定',detail:'問題セット',quiz:'復習セッション',manual:'問題を作る',original:'JSONを取り込む',text:'問題を作る'};
function frame(inner){document.getElementById('app').scrollTop=0;el.innerHTML=`<div class="content">${inner}</div>`;document.getElementById('crumb').textContent=sTitles[route]||'ホーム';document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===route));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));}
function navigate(to,params){navigationVersion++;route=to;quiz=to==='quiz'?params:quiz;const hash=to==='detail'?`detail/${params}`:to==='quiz'&&quiz?.id?'quiz/'+encodeURIComponent(quiz.id):to;if(location.hash!=='#'+hash)history.pushState(null,'','#'+hash);render();document.getElementById('app').scrollTop=0}
function updateUrl(){const k=decodeURIComponent(location.hash.replace(/^#/,''));if(k.startsWith('detail/')){route='detail';return k.split('/')[1]}if(k.startsWith('quiz/')){route='quiz';const id=k.slice(5);if(quiz?.id!==id)quiz=quizSessions.find(x=>x.id===id)||null;return null}if(['home','capture','library','review','settings','quiz','manual','original','text'].includes(k))route=k;return null}
function render(){const detailId=updateUrl();if(settings.aiUseNoticeVersion!==1)return onboarding();if(route==='home')return home();if(route==='capture')return textEntry();if(route==='library')return library();if(route==='review')return review();if(route==='settings')return preferences();if(route==='manual')return textEntry();if(route==='original')return originalImport();if(route==='text')return textEntry();if(route==='detail')return detail(detailId);if(route==='quiz'){if(!quiz&&location.hash==='#quiz')quiz=resumeSessions()[0]||null;return quizPage()}return home()}
function onboarding(){
 frame('<h1 class="page-title">はじめに1回だけ確認</h1><div class="card"><p>問題・学習履歴は、この端末のブラウザ内に保存されます。</p><p>ChatGPTが作った問題・正答・出典は未検証です。必要に応じて一次資料を確認してください。形式の検査だけでは内容の正確さは保証されません。</p><p>テーマから指示文を用意し、ChatGPTに自分で貼り付けて送信します。回答のJSONをここに戻すと学習できます。APIキーの設定は不要です。</p><label class="toggle-line"><input id="initial-notice-check" type="checkbox"><span>内容を理解し、未検証のAI問題を学習に利用します。</span></label><button id="initial-notice-accept" class="btn primary">確認して始める</button><p id="initial-notice-feedback" class="smalltext" role="status"></p></div>');
 document.getElementById('initial-notice-accept').onclick=()=>{if(!document.getElementById('initial-notice-check').checked){document.getElementById('initial-notice-feedback').textContent='内容を確認してチェックしてください';return}settings.aiUseNoticeVersion=1;try{saveSettings()}catch{message('確認を端末に保存できませんでした。今回は続けられますが、次回もう一度確認が必要です')}render()};
}
function home(){const stats=getStats();const available=records.filter(r=>(r.questions||[]).some(isPracticeQuestion));const weak=available.filter(r=>r.questions.some(q=>isWeakQuestion(q,r)));frame(`
<section class="home-start"><h1>学びたいことを、問題に。</h1><p class="smalltext">テーマを入力 → ChatGPTで作問 → JSONを貼って学習</p>
<div class="home-actions">
<button class="home-action home-action-main" data-go="text"><span class="home-action-icon">＋</span><span><strong>問題を作る</strong><small>学びたいテーマを入れるだけで指示文を用意</small></span><span class="home-action-arrow">→</span></button>
<button class="home-action" data-go="original"><span class="home-action-icon">↓</span><span><strong>JSONを取り込む</strong><small>ChatGPTの回答を貼り付けて保存</small></span><span class="home-action-arrow">→</span></button>
<button class="home-action" id="home-weak" ${weak.length?'':'disabled'}><span class="home-action-icon">↻</span><span><strong>苦手に挑戦</strong><small>${stats.weak}問の復習</small></span><span class="home-action-arrow">→</span></button>
<button class="home-action" id="home-all" ${available.length?'':'disabled'}><span class="home-action-icon">▦</span><span><strong>総復習</strong><small>全${stats.playable}問から出題</small></span><span class="home-action-arrow">→</span></button>
</div></section>${resumeList()}
<div class="home-progress-head"><strong>学習の進み具合</strong><span>習得 ${stats.mastered} / ${stats.questions}問</span></div>
<div class="loopq-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${Math.max(1,stats.questions)}" aria-valuenow="${stats.mastered}"><span style="width:${stats.questions?Math.round(stats.mastered/stats.questions*100):0}%"></span></div>
<div class="home-progress-summary"><span>卒業済み <b>${stats.mastered}</b></span><span>苦手 <b>${stats.weak}</b></span><button class="btn sm ghost" data-go="library">問題集を見る →</button></div>
<p class="smalltext development-note">写真から自動で問題を作る：開発中</p>
${!available.length?'<p class="smalltext">初めての方は「問題を作る」から。完成済みのJSONがあれば、そのまま取り込めます。</p>':''}`);
document.getElementById('home-weak').onclick=()=>startQuiz(weak,true,'weak');wireResumeButtons();document.getElementById('home-all').onclick=()=>startQuiz(available,false,'all');
}
function listRow(r){return `<div class="list-row"><span class="list-icon">${r.image?'▧':'✎'}</span><div class="list-text"><strong>${escape(r.title)}</strong><small>${escape(r.exam)} · ${date(r.createdAt)} · ${(r.questions||[]).length}問</small></div><button class="btn sm ghost" data-detail="${escape(r.id)}">開く</button></div>`}
function wireDetailButtons(){document.querySelectorAll('[data-detail]').forEach(x=>x.onclick=()=>navigate('detail',x.dataset.detail))}
async function acceptCommitted(rows){const ids=new Set(rows.map(r=>r.id));records=[...records.filter(r=>!ids.has(r.id)),...rows];try{await refresh()}catch{message('保存は完了しました。表示の再読込に失敗したため、必要ならホームを開き直してください')}return rows}
async function persistOriginal(rows){
 const cleaned=LoopQSafety.validateBackup({format:'loopq.v2',records:rows});
 if(cleaned.some(row=>records.some(r=>r.id===row.id)))throw Error('この原文データは取り込み済みです。問題集から開いてください');
 await tx('readwrite',store=>{for(const row of cleaned)store.add(row)});
 return acceptCommitted(cleaned);
}
function textEntry(){LoopQTopicEntry.mount({frame,onImport:()=>navigate('original')})}
function originalImport(){
 frame(`<h1 class="page-title">JSONを取り込む</h1><div class="card" id="original-import"><p>ChatGPTの回答を下の欄に貼り付けてください。コードブロックごとのコピーにも対応しています。</p><p class="smalltext">最大1,000問。保存前に問題数・正答・解説を確認できます。内容や法令の正確さは自動検証しません。</p><div class="field"><label for="original-text">ChatGPTの完成した回答（JSON）を貼り付け</label><textarea id="original-text" rows="10" maxlength="1000000" placeholder='{"questions":[{"statement":"元の問題文","answer":true,"explanation":"元の解説"}]}'></textarea></div><p class="smalltext" role="status" aria-live="polite" id="original-feedback"></p><details class="details"><summary>分類の確認・JSONファイルから取り込む</summary><div class="field"><label for="original-exam">科目・問題集の分類</label><input id="original-exam" maxlength="80" value="${escape(originalExam||settings.exam)}"></div><label class="btn primary" for="original-file">JSONファイルを選ぶ（任意）</label><input id="original-file" type="file" accept="application/json,.json" hidden></details><details><summary id="original-preview-title">取り込む問題を確認</summary><div id="original-preview"></div></details><p class="smalltext">正答がない問題は「正答未確認」として保存し、採点する復習には出しません。保存済みの問題・学習履歴は置き換えません。</p><div class="flow-actions"><button class="btn ghost" data-go="text">戻る</button><button class="btn primary" id="original-save">問題を保存して解く</button></div></div>`);
 const panel=document.getElementById('original-import'),input=document.getElementById('original-text'),feedback=document.getElementById('original-feedback'),button=document.getElementById('original-save'),fileInput=document.getElementById('original-file'),examInput=document.getElementById('original-exam');
 input.value=originalDraft;let busy=false,reading=0,filePending=false,fileBlocked=false;
 const updateSave=()=>button.disabled=busy||filePending||fileBlocked;
 const active=()=>document.getElementById('original-import')===panel;
 function inspect(){
  originalDraft=input.value;const preview=document.getElementById('original-preview');preview.replaceChildren();
  if(!input.value){feedback.textContent='ChatGPTの回答を貼り付けてください。JSONファイルも選べます。';return}
  try{const parsed=LoopQOriginal.parse(input.value);if(parsed.exam)examInput.value=parsed.exam;const known=parsed.questions.filter(isPracticeQuestion).length;feedback.textContent=parsed.questions.length+'問を読み取りました。採点可能 '+known+'問 / 正答未確認 '+(parsed.questions.length-known)+'問';document.getElementById('original-preview-title').textContent='全'+parsed.questions.length+'問の内容を確認';
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
  if(settings.aiUseNoticeVersion!==1){onboarding();return}
  let parsed;const exam=examInput.value.trim();try{parsed=LoopQOriginal.parse(input.value);if(!exam||exam==='その他')throw Error('科目・問題集の分類を入力してください')}catch(e){feedback.textContent='保存できません：'+e.message;return}
  busy=true;originalImportSaving=true;reading++;button.disabled=true;input.disabled=true;fileInput.disabled=true;examInput.disabled=true;
  try{const rows=await LoopQOriginal.records(parsed,exam),saved=await persistOriginal(rows);originalDraft='';settings.exam=exam;try{saveSettings()}catch{}
   if(active()){if(saved.some(r=>r.questions.some(isPracticeQuestion)))await startQuiz(saved);else{navigate('detail',saved[0].id);message('原文を保存しました。正答未確認のため、採点する復習には出しません')}}else message(parsed.questions.length+'問の原文を保存しました。問題集から開けます');
  }catch(e){if(active())feedback.textContent='保存できません：'+(e.name==='ConstraintError'?'同じ原文は取り込み済みです。既存の学習履歴は変更していません':e.message)}finally{busy=false;originalImportSaving=false;updateSave();input.disabled=false;fileInput.disabled=false;examInput.disabled=false}
 };
 inspect();
}

function pageControls(page,total){return `<div class="page-controls"><button id="page-prev" class="btn ghost sm" ${page===0?'disabled':''}>前へ</button><span>${page+1} / ${total}</span><button id="page-next" class="btn ghost sm" ${page>=total-1?'disabled':''}>次へ</button></div>`}
function library(){
 const all=filter==='all'?records:filter==='weak'?records.filter(r=>r.weak||(r.questions||[]).some(q=>q.weak)):records.filter(r=>r.exam===filter),exams=[...new Set(records.map(r=>r.exam))],total=Math.max(1,Math.ceil(all.length/2));libraryPage=Math.min(libraryPage,total-1);
 frame(`<div class="page-heading"><h1 class="page-title">マイ問題集</h1><button class="btn primary sm" data-go="text">問題を追加</button></div><div class="field compact-filter"><label for="library-filter">表示</label><select id="library-filter">${[{k:'all',v:'すべて'},{k:'weak',v:'苦手だけ'},...exams.map(x=>({k:x,v:x}))].map(x=>`<option value="${escape(x.k)}" ${filter===x.k?'selected':''}>${escape(x.v)}</option>`).join('')}</select><span class="smalltext">${all.length}セット</span></div><div class="source-grid">${all.slice(libraryPage*2,libraryPage*2+2).map(sourceCard).join('')||'<p>保存した問題はありません。</p>'}</div>${pageControls(libraryPage,total)}`);
 document.getElementById('library-filter').onchange=e=>{filter=e.target.value;libraryPage=0;library()};
 document.getElementById('page-prev').onclick=()=>{libraryPage--;library()};document.getElementById('page-next').onclick=()=>{libraryPage++;library()};
 wireDetailButtons();wireReviewButtons();
}
function sourceCard(r){const n=r.questions?.length||0;return `<article class="source-card"><div class="source-top"><div class="list-text"><span class="exam-chip">${escape(r.exam)}</span><h3>${escape(r.title)}</h3><small>${date(r.createdAt)} · ${n}問</small></div></div><div class="source-buttons"><button class="btn sm ghost" data-detail="${escape(r.id)}">開く</button>${r.questions?.some(isPracticeQuestion)?`<button class="btn sm primary" data-review="${escape(r.id)}">${setResumeLabel(r)}</button>`:''}</div></article>`}
function detail(id){
 const r=records.find(x=>x.id===id);if(!r){navigate('library');return}
 frame(`<div class="page-heading"><h1 class="page-title">問題セット</h1><button class="btn ghost sm" data-go="library">一覧へ</button></div><p class="smalltext">${escape(r.exam)} · ${escape(r.title)}</p><div id="detail-questions" class="card"><h2>問題（${r.questions.length}問）</h2><div class="question-list">${r.questions.map((q,i)=>`<details class="original-question-detail"><summary>${escape(q.originalId||String(i+1))}. ${escape(q.statement.slice(0,60))}${q.statement.length>60?'…':''}${isPracticeQuestion(q)?'':' 正答未確認（出題対象外）'}</summary><p>${escape(q.statement)}</p><p>正答：${isPracticeQuestion(q)?(q.answer?'○':'×'):'未確認'}</p><p>${escape(q.explanation||'解説の記載なし')}</p><p class="smalltext">${escape(q.reference)}${q.sourcePage?' / 元資料 '+q.sourcePage+'ページ':''}</p></details>`).join('')||'<p>このセットには問題がありません。保存済みのデータはバックアップに含まれます。</p>'}</div><div class="button-group">${r.questions.some(isPracticeQuestion)?'<button id="quiz-source" class="btn primary">'+setResumeLabel(r)+'</button>':'<p>採点できる問題はありません。</p>'}<button id="weak-toggle" class="btn ghost">${r.weak?'苦手登録を解除':'苦手に登録'}</button></div></div><p class="smalltext">問題・正答・出典は未検証です。必要に応じて一次資料を確認してください。</p>`);
 document.getElementById('weak-toggle').onclick=async()=>{try{await persist({...r,weak:!r.weak});detail(id)}catch(e){message('保存できません：'+e.message)}};
 document.getElementById('quiz-source')?.addEventListener('click',()=>startQuiz([r]));
}

function wireReviewButtons(){document.querySelectorAll('[data-review]').forEach(x=>x.onclick=()=>{const r=records.find(y=>y.id===x.dataset.review);if(r)startQuiz([r])})}
function review(){const stats=getStats(),available=records.filter(r=>r.questions?.some(isPracticeQuestion)),weak=available.filter(r=>r.questions.some(q=>isWeakQuestion(q,r)));frame(`<h1 class="page-title">復習</h1>${resumeList()}<p class="smalltext">解答 ${stats.answers}回 · 正答率 ${stats.accuracy}%</p><div class="review-actions"><button class="btn primary" id="weak-review" ${weak.length?'':'disabled'}>苦手に挑戦（${stats.weak}問）</button><button class="btn ghost" id="all-review" ${available.length?'':'disabled'}>総復習（${stats.playable}問）</button></div>${available.length?'':'<p class="smalltext">「問題を作る」または「JSONを取り込む」から、学習する問題を追加してください。</p>'}`);document.getElementById('weak-review').onclick=()=>startQuiz(weak,true,'weak');wireResumeButtons();document.getElementById('all-review').onclick=()=>startQuiz(available,false,'all')}

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
 frame(`<div class="quiz-shell"><div class="quiz-head"><div><strong id="quiz-position" tabindex="-1">問題 ${quiz.index+1} / ${quiz.pool.length}</strong><p class="smalltext">${LoopQProgress.count(quiz)}問 解答済み · 自動保存</p></div><button id="quit" class="btn ghost sm">ホーム</button></div><div class="card quiz-card">${done?`<div class="answer-result ${quiz.picked===q.answer?'result-correct':'result-wrong'}" role="status">${quiz.picked===q.answer?'正解':'不正解'}</div><div class="answer-summary"><span>あなたの回答：${quiz.picked?'○':'×'}</span><span>正しい答え：${q.answer?'○':'×'}</span></div><div class="segmented"><button id="show-explanation" class="btn primary sm">解説</button><button id="show-question" class="btn ghost sm">問題文</button></div><div class="quiz-reading" tabindex="0" id="quiz-explanation"><p>${escape(q.explanation||(q.kind==='original'?'元資料に解説の記載はありません':''))}</p>${q.trap?`<p><b>要点：</b>${escape(q.trap)}</p>`:''}${q.reference?`<p class="smalltext">出典：${escape(q.reference)}</p>`:''}</div><div class="quiz-reading" tabindex="0" id="quiz-question" hidden><p class="question">${escape(q.statement)}</p></div><button id="mark-weak" class="btn ghost sm">${q.weak?'苦手登録を解除':'苦手に登録'}</button>`:`<p class="smalltext">${escape(r.exam)}${q.kind==='original'?' / 問題 '+escape(q.originalId||'')+(q.sourcePage?' / '+q.sourcePage+'ページ':''):''}</p><div class="quiz-reading" tabindex="0"><p class="question">${escape(q.statement)}</p></div>`}</div><p class="smalltext">ホームへ戻っても、解答と続きは保存されます。</p><button id="restart-quiz" class="btn ghost sm">この復習を最初からやり直す</button>${resultDock(done,quiz.index===quiz.pool.length-1)}</div>`);
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
 frame(`<h1 class="page-title">設定</h1><div class="segmented"><button class="btn primary" id="settings-data">データ</button><button class="btn ghost" id="settings-about">このアプリについて</button></div><div class="card" id="data-pane"><h2>バックアップ</h2><p class="smalltext">問題・学習履歴は、このブラウザ内に保存されます。他の端末には自動同期されません。以前の添付データもバックアップに含まれます。</p><p class="smalltext">サイトデータを削除すると消えます。必要なデータは書き出してください。</p><div class="button-group"><button id="export" class="btn primary">バックアップ保存</button><label class="btn ghost" for="import-file">復元する</label><input id="import-file" hidden type="file" accept="application/json,.json"></div><p class="smalltext">${records.length}セット / ${getStats().questions}問</p><button class="btn danger sm" id="erase">全データを削除</button></div><div class="card" id="about-pane" hidden><h2>LoopQ プレビュー版</h2><p>テーマから指示文を用意 → ChatGPTに貼り付けて作問 → 回答のJSONを取り込み。自動生成・自動送信は行いません。APIキーは不要です。ChatGPT側の利用条件・上限が適用されます。</p><p>AIの正答・法令・出典は、ご自身で一次資料を確認してください。</p><p class="smalltext">iPhone実機での検証は継続中です。</p></div>`);
 const tab=about=>{document.getElementById('data-pane').hidden=about;document.getElementById('about-pane').hidden=!about;document.getElementById('settings-data').className='btn '+(about?'ghost':'primary');document.getElementById('settings-about').className='btn '+(about?'primary':'ghost')};document.getElementById('settings-data').onclick=()=>tab(false);document.getElementById('settings-about').onclick=()=>tab(true);
 document.getElementById('export').onclick=backup;document.getElementById('import-file').onchange=importBackup;document.getElementById('erase').onclick=async()=>{if(!confirm('保存済みの全問題・添付データ・解答履歴を完全に削除します。取り消せません。実行しますか？'))return;try{await clearStudyData();quizSessions=[];quiz=null;await refresh();message('学習データを削除しました');navigate('home')}catch(e){message('削除できません：'+e.message)}};
}

function saveSettings(){localStorage.setItem(SETTING,JSON.stringify(settings))}
function backup(){try{const parts=LoopQBackup.parts(records),box=document.createElement('div');box.className='card';const info=document.createElement('p');info.textContent=parts.length>1?'復元上限に合わせて分割しました。全ファイルを保存し、復元時は各ファイルを順に取り込んでください。':'下のリンクを押してバックアップを保存してください。';box.append(info);parts.forEach((blob,i)=>{const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download='loopq-backup-'+new Date().toISOString().slice(0,10)+'-part-'+(i+1)+'-of-'+parts.length+'.json';a.textContent='バックアップ '+(i+1)+' / '+parts.length+' を保存';a.className='btn ghost';a.onclick=()=>setTimeout(()=>URL.revokeObjectURL(url),60000);box.append(a)});document.getElementById('backup-downloads')?.remove();box.id='backup-downloads';el.append(box);message('バックアップの準備ができました')}catch(e){message('バックアップを作成できません：'+e.message)}}
async function importBackup(e){const file=e.target.files?.[0];if(!file)return;if(file.size>LoopQBackup.MAX_BYTES){message('バックアップのサイズが大きすぎます');return}try{const data=JSON.parse(await file.text());if(data.format!=='loopq.v2'||!Array.isArray(data.records))throw Error('形式が違います');if(data.records.length>10000)throw Error('件数が多すぎます');const cleaned=LoopQSafety.validateBackup(data);if(!confirm(`${cleaned.length}件のセットを端末に追加します。既存IDは上書きされます。よいですか？`))return;await restoreStudyData(cleaned);await refresh();await refreshQuizSessions();quiz=null;message('復元しました');navigate('home')}catch(err){message('復元できません：'+err.message)}}
window.addEventListener('hashchange',()=>{navigationVersion++;render()});document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));document.getElementById('top-settings').onclick=()=>navigate('settings');document.getElementById('top-home').onclick=()=>navigate('home');
readDB().then(async x=>{db=x;await refresh();await refreshQuizSessions();render();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{})}).catch(e=>{el.innerHTML=`<div class="content"><div class="notice warn">保存機能を開始できませんでした。ブラウザのプライベートモード設定を確認してください：${escape(e.message)}</div></div>`});
})();

