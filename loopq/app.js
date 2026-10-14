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
let libraryPage=0;const removedPhotos=new Map(),photoBusy=new Set();
let settings=Object.assign({exam:EXAMS[0]},JSON.parse(localStorage.getItem(SETTING)||'{}'));
// ChatGPT plan-sharing only: until SIWC approval, generation stays disabled. No owner-billed API fallback.
function message(t){toastEl.textContent=t;toastEl.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('visible'),3300)}
function readDB(){return new Promise((res,rej)=>{const req=indexedDB.open(DB,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)})}
function tx(mode,fn){return new Promise((res,rej)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let val;try{val=fn(s)}catch(e){rej(e);return}t.oncomplete=()=>res(val);t.onerror=()=>rej(t.error)})}
async function refresh(){const t=db.transaction(STORE,'readonly'),s=t.objectStore(STORE);records=await new Promise((res,rej)=>{const req=s.getAll();req.onsuccess=()=>res(req.result);req.onerror=()=>rej(req.error)});records.sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''))}
async function persist(r){await tx('readwrite',s=>s.put(r));await refresh()}
async function remove(id){await tx('readwrite',s=>s.delete(id));await refresh()}
function isWeakQuestion(q,r){return !q.mastered && (q.weak === true || (q.attempts||0)>(q.correct||0) || r.weak===true)}
function isGraduated(q){return q.mastered===true}
function getStats(){const qs=records.flatMap(r=>r.questions||[]);const answers=qs.reduce((a,q)=>a+(q.attempts||0),0),correct=qs.reduce((a,q)=>a+(q.correct||0),0);return {sources:records.length,questions:qs.length,answers,correct,accuracy:answers?Math.round(correct/answers*100):0,weak:records.reduce((n,r)=>n+(r.questions||[]).filter(q=>isWeakQuestion(q,r)).length,0),mastered:qs.filter(isGraduated).length}}
const sTitles={home:'ホーム',capture:'問題を追加',library:'マイ問題集',review:'苦手を復習',settings:'設定',detail:'問題セット',quiz:'復習セッション',manual:'手動で問題登録'};
function frame(inner){el.innerHTML=`<div class="content">${inner}</div>`;document.getElementById('crumb').textContent=sTitles[route]||'ホーム';document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===route));document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)));}
function navigate(to,params){route=to;quiz=to==='quiz'?params:quiz;const hash=to==='detail'?`detail/${params}`:to;if(location.hash!=='#'+hash)history.pushState(null,'','#'+hash);render();document.getElementById('app').scrollTop=0}
function updateUrl(){const k=decodeURIComponent(location.hash.replace(/^#/,''));if(k.startsWith('detail/')){route='detail';return k.split('/')[1]}if(['home','capture','library','review','settings','quiz','manual'].includes(k))route=k;return null}
function render(){const detailId=updateUrl();if(route==='home')return home();if(route==='capture')return capture();if(route==='library')return library();if(route==='review')return review();if(route==='settings')return preferences();if(route==='manual')return manual();if(route==='detail')return detail(detailId);if(route==='quiz')return quizPage();return home()}
function home(){const stats=getStats();const available=records.filter(r=>(r.questions||[]).length>0);const weak=available.filter(r=>r.questions.some(q=>isWeakQuestion(q,r)));frame(`
<section class="home-start">

 <h1>ホーム</h1>

 <div class="home-actions">
  <button class="home-action home-action-main" id="home-weak" ${weak.length?'':'disabled'}><span class="home-action-icon">↻</span><span><strong>苦手に挑戦</strong><small>${stats.weak}問の復習</small></span><span class="home-action-arrow">→</span></button>
  <button class="home-action" id="home-all" ${available.length?'':'disabled'}><span class="home-action-icon">▦</span><span><strong>総復習</strong><small>全${stats.questions}問から出題</small></span><span class="home-action-arrow">→</span></button>
  <button class="home-action" data-go="capture"><span class="home-action-icon">＋</span><span><strong>問題を追加</strong><small>写真から類題を3問作る</small></span><span class="home-action-arrow">→</span></button>
 </div>
 </section>
 <div class="home-progress-head"><strong>学習の進み具合</strong><span>習得 ${stats.mastered} / ${stats.questions}問</span></div>
 <div class="loopq-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="${stats.questions}" aria-valuenow="${stats.mastered}"><span style="width:${stats.questions?Math.round(stats.mastered/stats.questions*100):0}%"></span></div>
 <div class="home-progress-summary"><span>卒業済み <b>${stats.mastered}</b></span><span>苦手 <b>${stats.weak}</b></span><button class="btn sm ghost" data-go="library">問題集を見る →</button></div>
 ${!available.length?'<p class="smalltext">まだ類題がありません。まず「問題を追加」から始めましょう。</p>':''}
`);
document.getElementById('home-weak').onclick=()=>startQuiz(weak,true);
document.getElementById('home-all').onclick=()=>startQuiz(available,false);
}
function listRow(r){return `<div class="list-row"><span class="list-icon">${r.image?'▧':'✎'}</span><div class="list-text"><strong>${escape(r.title)}</strong><small>${escape(r.exam)} · ${date(r.createdAt)} · ${(r.questions||[]).length}問</small></div><button class="btn sm ghost" data-detail="${escape(r.id)}">開く</button></div>`}
function wireDetailButtons(){document.querySelectorAll('[data-detail]').forEach(x=>x.onclick=()=>navigate('detail',x.dataset.detail))}
function capture(){
 frame(`<h1 class="page-title">元問題を追加</h1><div class="card capture-card"><div class="field"><label for="exam">試験・資格</label><select id="exam">${EXAMS.map(x=>`<option ${x===settings.exam?'selected':''}>${escape(x)}</option>`).join('')}</select></div><details class="custom-exam" id="custom-exam-options" ${EXAMS.includes(settings.exam)?'':'open'}><summary>一覧にない資格を入力</summary><div class="field"><label for="custom-exam">一覧にない場合は、資格名を入力してください</label><input id="custom-exam" maxlength="60" placeholder="資格名（任意）" value="${EXAMS.includes(settings.exam)?'':escape(settings.exam)}"></div></details><label class="drop" for="photo-input"><div id="photo-area"><strong>写真を撮る・選ぶ</strong></div><input id="photo-input" type="file" accept="image/*" hidden></label><button class="btn primary" id="save-source">類題を3問作る</button><p class="smalltext">写真を端末内に保存し、ChatGPTで作る手順へ進みます。</p><p id="capture-status" class="smalltext" role="status"></p><button class="btn ghost sm" data-go="manual">手動で問題を登録</button></div>`);
 const area=document.getElementById('photo-area'),input=document.getElementById('photo-input'),btn=document.getElementById('save-source'),status=document.getElementById('capture-status');
 let loading=false,photoRequest=0;
 document.getElementById('exam').onchange=()=>{if(document.getElementById('exam').value==='その他')document.getElementById('custom-exam-options').open=true};
 const showPhoto=()=>{area.replaceChildren();const img=document.createElement('img');img.src=LoopQSafety.safeImage(uploadPreview);img.alt='選択した元問題';img.className='capture-photo';area.append(img)};
 if(uploadPreview)showPhoto();
 input.addEventListener('change',async()=>{if(!input.files?.[0])return;const request=++photoRequest;loading=true;btn.disabled=true;status.textContent='写真を読み込み中…';try{const file=input.files[0],preview=await processImage(file);if(request!==photoRequest)return;chosenFile=file;uploadPreview=preview;showPhoto();status.textContent=''}catch(e){if(request===photoRequest)status.textContent='画像を読み込めません：'+e.message}finally{if(request===photoRequest){loading=false;btn.disabled=false}}});
 btn.onclick=async()=>{
  if(saving||loading)return;
  if(!uploadPreview){status.textContent='元問題の写真を選んでください';return}
  const exam=document.getElementById('custom-exam').value.trim()||document.getElementById('exam').value;
  if(exam==='その他'){status.textContent='資格名を入力してください';return}
  saving=true;btn.disabled=true;status.textContent='保存中…';
  const r={id:uid(),title:'元問題 '+new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date()),exam,topic:'',image:uploadPreview,questions:[],weak:false,createdAt:new Date().toISOString(),status:'saved'};
  try{await persist(r);settings.exam=exam;try{saveSettings()}catch{}chosenFile=null;uploadPreview=null;navigate('detail',r.id);renderHandoff(r)}catch(e){status.textContent='保存できません：'+e.message;btn.disabled=false}finally{saving=false}
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
function sourceCard(r){const n=r.questions?.length||0;return `<article class="source-card"><div class="source-top"><span data-photo="${escape(r.id)}"></span><div class="list-text"><span class="exam-chip">${escape(r.exam)}</span><h3>${escape(r.title)}</h3><small>${date(r.createdAt)} · ${n}問</small></div></div><div class="source-buttons"><button class="btn sm ghost" data-detail="${escape(r.id)}">開く</button>${n?`<button class="btn sm primary" data-review="${escape(r.id)}">解く</button>`:''}${r.image?`<button class="btn danger sm" data-delete-photo="${escape(r.id)}">画像を削除</button>`:removedPhotos.has(r.id)?`<button class="btn teal sm" data-undo-photo="${escape(r.id)}">画像削除を取り消す</button>`:'<span class="smalltext">画像なし</span>'}</div></article>`}

function detail(id){
 const r=records.find(x=>x.id===id);if(!r){navigate('library');return}
 frame(`<div class="page-heading"><h1 class="page-title">問題セット</h1><button class="btn ghost sm" data-go="library">一覧へ</button></div><p class="smalltext">${escape(r.exam)} · ${escape(r.title)}</p><div class="segmented"><button class="btn primary" id="tab-questions">類題（${r.questions.length}問）</button><button class="btn ghost" id="tab-photo">元画像</button></div><div id="detail-questions" class="card"><div class="question-list">${r.questions.map((q,i)=>`<p>${i+1}. ${escape(q.statement.slice(0,60))}${q.statement.length>60?'…':''}</p>`).join('')||'<p>類題はまだありません。</p>'}</div><div class="button-group">${r.questions.length?'<button id="quiz-source" class="btn primary">類題を解く</button>':'<button id="open-handoff" class="btn primary">類題を3問作る</button>'}<button id="weak-toggle" class="btn ghost">${r.weak?'苦手登録を解除':'苦手に登録'}</button></div></div><div id="detail-image" class="card" hidden><div data-photo="${escape(r.id)}" data-full="true"></div>${r.image?'':'<p>画像なし</p>'}${r.topic?`<p class="smalltext">${escape(r.topic)}</p>`:''}<button class="btn danger sm" id="delete-source">セット全体を削除</button></div><p class="smalltext">AI問題の正答・出典は一次資料で確認してください。</p><div id="handoff-panel"></div>`);
 const tab=photo=>{document.getElementById('detail-image').hidden=!photo;document.getElementById('detail-questions').hidden=photo;document.getElementById('tab-photo').className='btn '+(photo?'primary':'ghost');document.getElementById('tab-questions').className='btn '+(photo?'ghost':'primary')};
 document.getElementById('tab-photo').onclick=()=>tab(true);document.getElementById('tab-questions').onclick=()=>tab(false);mountPhotos();
 document.getElementById('weak-toggle').onclick=async()=>{try{await persist({...r,weak:!r.weak});detail(id)}catch(e){message('保存できません：'+e.message)}};
 document.getElementById('delete-source').onclick=async()=>{if(confirm('画像・類題・学習履歴をすべて削除しますか？')){try{await remove(id);removedPhotos.delete(id);navigate('library')}catch(e){message('削除できません：'+e.message)}}};
 document.getElementById('quiz-source')?.addEventListener('click',()=>startQuiz([r]));document.getElementById('open-handoff')?.addEventListener('click',()=>renderHandoff(r));
}

function handoffPrompt(r){return `あなたは資格試験の応用問題を作る作問者です。ユーザーがこのチャットに添付する試験問題の写真から、論点と難易度を分析し、元の文章・選択肢・固有の事例・配置を再利用せず、独立した新しい○×問題を厳密に3問作ってください。\n\n【資格】${r.exam}\n【メモ】${r.topic||'なし'}\n【元問題のタイトル】${r.title}\n\n必須条件：\n・元問題と同じ水準以上の難しさ。基礎的な定義確認で水増ししない。\n・各問に具体的な事例、例外、数字、時期、当事者など複数条件を含める。\n・元問題の創作的表現をコピーしたり、軽く言い換えたりしない。\n・正答と、誤りの理由が分かる解説を付ける。\n・法律系は適用される試験年度の施行法令を確認し、未確認の根拠は推測して書かない。\n・各問について正答をもう一度独立に検証し、疑問があれば作り直す。\n・出力は**以下の形式のJSONオブジェクトのみ**。Markdownコードブロックも前置きも不要。\n\n{\"questions\":[{\"statement\":\"問題文\",\"answer\":true,\"explanation\":\"解説\",\"reference\":\"実際に確認できた法令・公的出典名と条文（未確認なら未確認）\",\"trap\":\"ひっかけの要点\"},{\"statement\":\"問題文\",\"answer\":false,\"explanation\":\"解説\",\"reference\":\"確認できた根拠または未確認\",\"trap\":\"要点\"},{\"statement\":\"問題文\",\"answer\":true,\"explanation\":\"解説\",\"reference\":\"根拠\",\"trap\":\"要点\"}]}\n\nこのチャットに写真が実際に添付されていることを確認してから生成してください。画像が見えない場合は問題を生成せず、写真の添付を依頼してください。`}
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
function renderHandoff(r){
 frame('<h1 class="page-title">類題を3問作る</h1><div id="handoff-panel"></div>');
 const panel=document.getElementById('handoff-panel');
 panel.innerHTML=`<section class="ai-local-card" id="ai-local-card" hidden></section><div class="handoff-card"><div class="page-heading"><strong id="handoff-step-title">1 / 3　ChatGPTへ送る</strong><button class="btn ghost sm" id="close-handoff">セットへ</button></div><section id="handoff-send"><p class="smalltext">指示文と写真をChatGPTへ送ってください。自動送信はしません。</p><button class="btn primary" id="copy-prompt">指示文をコピー</button><div class="button-group">${r.image?'<button class="btn teal" id="share-photo">写真を共有</button><button class="btn ghost" id="export-photo">写真を保存</button>':'<p class="smalltext">元画像がありません。ChatGPTに元の写真を添付してください。</p>'}<a class="btn ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">ChatGPTを開く ↗</a></div><details class="details"><summary>指示文を確認・編集</summary><label class="sr-only" for="handoff-prompt">作問指示文</label><textarea id="handoff-prompt" class="code-input" rows="4"></textarea></details><button class="btn primary" id="handoff-to-input">回答を貼り付ける →</button></section><section id="handoff-input" hidden><div class="field"><label for="generated-json">ChatGPTの回答を貼り付け</label><textarea id="generated-json" class="code-input" rows="5" maxlength="30000"></textarea></div><div class="button-group"><button class="btn ghost" id="handoff-to-send">戻る</button><button class="btn primary" id="preview-json">3問を確認 →</button></div></section><section id="handoff-review" hidden><div id="json-preview" aria-live="polite"></div><div class="page-controls"><button class="btn ghost sm" id="preview-prev">前の問題</button><span id="preview-count"></span><button class="btn ghost sm" id="preview-next">次の問題</button></div><label class="toggle-line"><input type="checkbox" id="manual-review-ok"><span>3問の正答・解説・法令の適用時期を確認しました。出典は未検証として保存します。</span></label><div class="button-group"><button class="btn ghost" id="handoff-edit">入力に戻る</button><button class="btn primary" id="accept-json">3問を保存</button></div></section><p id="handoff-feedback" class="smalltext" role="status" aria-live="polite"></p></div>`;
 const showStep=n=>{['send','input','review'].forEach((key,i)=>document.getElementById('handoff-'+key).hidden=i!==n);document.getElementById('handoff-step-title').textContent=['1 / 3　ChatGPTへ送る','2 / 3　回答を貼り付け','3 / 3　内容を確認'][n];document.getElementById('app').scrollTop=0};
 document.getElementById('handoff-to-input').onclick=()=>showStep(1);document.getElementById('handoff-to-send').onclick=()=>showStep(0);document.getElementById('handoff-edit').onclick=()=>showStep(1);document.getElementById('close-handoff').onclick=()=>detail(r.id);
 setupLocalAI(panel,r);
 document.getElementById('handoff-prompt').value=handoffPrompt(r);
 document.getElementById('copy-prompt').onclick=async()=>{const value=document.getElementById('handoff-prompt').value;try{await navigator.clipboard.writeText(value);message('指示文をコピーしました。次は写真をChatGPTに添付してください。')}catch{document.getElementById('handoff-prompt').select();message('自動コピーできません。選択された指示文を手動でコピーしてください')}};
 document.getElementById('share-photo')?.addEventListener('click',()=>{
   const feedback=document.getElementById('handoff-feedback');
   try{
     const file=photoAsFile(r.image,r.id);
     if(typeof navigator.share==='function'&&(!navigator.canShare||navigator.canShare({files:[file]}))){
       // Must invoke share() directly from a user gesture, without awaiting clipboard or async conversion.
       navigator.share({files:[file],title:'LoopQの学習問題'}).then(()=>{feedback.textContent='共有した写真がChatGPTに表示されていることを確認し、コピーした指示文を貼って送信してください。'}).catch(e=>{if(e.name!=='AbortError')feedback.textContent='共有できませんでした。「添付用の写真を保存」を使ってください。'});
     } else feedback.textContent='この端末では写真の共有に対応していません。「添付用の写真を保存」からChatGPTで添付してください。';
   }catch(e){feedback.textContent='写真を共有できません：'+e.message}
 });
 document.getElementById('export-photo')?.addEventListener('click',()=>{const src=LoopQSafety.safeImage(r.image);if(!src){message('保存画像が見つかりません');return}const a=document.createElement('a');a.href=src;a.download='loopq-question-'+r.id+'.jpg';document.body.appendChild(a);a.click();a.remove();message('写真の保存を試みました。写真・ファイルアプリを確認してください。')});
 const input=document.getElementById('generated-json'),preview=document.getElementById('json-preview'),accept=document.getElementById('accept-json');
 let checkedText=null,busy=false,previewQuestions=[],previewIndex=0;const viewed=new Set();
 function drawPreview(){preview.replaceChildren();const q=previewQuestions[previewIndex],box=document.createElement('section');box.className='preview-question';box.tabIndex=0;box.textContent=q.statement+'\n正しい答え：'+(q.answer?'○':'×')+'\n解説：'+q.explanation+'\n出典：'+q.reference+'\n要点：'+q.trap;preview.append(box);viewed.add(previewIndex);document.getElementById('preview-count').textContent=(previewIndex+1)+' / 3';document.getElementById('preview-prev').disabled=previewIndex===0;document.getElementById('preview-next').disabled=previewIndex===2;accept.disabled=viewed.size!==3}
 document.getElementById('preview-prev').onclick=()=>{if(previewIndex>0){previewIndex--;drawPreview()}};document.getElementById('preview-next').onclick=()=>{if(previewIndex<2){previewIndex++;drawPreview()}};
 accept.disabled=true;
 input.addEventListener('input',()=>{checkedText=null;accept.disabled=true;preview.textContent='入力が変わりました。もう一度プレビューしてください';document.getElementById('manual-review-ok').checked=false});
 document.getElementById('preview-json').onclick=()=>{
  checkedText=null;accept.disabled=true;preview.replaceChildren();
  try{
   const parsed=LoopQPastedJSON.parse(input.value);
   previewQuestions=parsed.questions;previewIndex=0;viewed.clear();document.getElementById('manual-review-ok').checked=false;checkedText=input.value;document.getElementById('handoff-feedback').textContent=parsed.notes.join('。');showStep(2);drawPreview();
  }catch(e){document.getElementById('handoff-feedback').textContent='確認できません：'+e.message+'（入力と学習履歴は変更していません）'}
 };
 accept.onclick=async()=>{
  const feedback=document.getElementById('handoff-feedback');
  if(busy)return;
  if(checkedText===null||checkedText!==input.value||viewed.size!==3){feedback.textContent='先に現在の入力をプレビューしてください';return}
  if(!document.getElementById('manual-review-ok').checked){feedback.textContent='プレビューと正答・解説を確認し、チェックしてください';return}
  try{
   const newQs=cleanPastedQuestions(input.value);
   if(r.questions.length)throw Error('既存の類題と学習履歴があるため置き換えません。新しいセットに保存してください');
   busy=true;accept.disabled=true;
   const updated={...r,questions:newQs,status:'review_required'};
   await persist(updated);message('3問を保存しました（出典は未検証です）');detail(r.id);
  }catch(e){feedback.textContent='保存できません：'+e.message}finally{busy=false;accept.disabled=false}
 };
 document.getElementById('app').scrollTop=0;
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
function review(){const stats=getStats(),available=records.filter(r=>r.questions?.length),weak=available.filter(r=>r.questions.some(q=>isWeakQuestion(q,r)));frame(`<h1 class="page-title">復習</h1><p class="smalltext">解答 ${stats.answers}回 · 正答率 ${stats.accuracy}%</p><div class="review-actions"><button class="btn primary" id="weak-review" ${weak.length?'':'disabled'}>苦手に挑戦（${stats.weak}問）</button><button class="btn ghost" id="all-review" ${available.length?'':'disabled'}>総復習（${stats.questions}問）</button></div>${available.length?'':'<p class="smalltext">先に元問題を追加して、類題を作ってください。</p>'}`);document.getElementById('weak-review').onclick=()=>startQuiz(weak,true);document.getElementById('all-review').onclick=()=>startQuiz(available)}

function startQuiz(sets,weakOnly=false){let pool=sets.flatMap(r=>r.questions.filter(q=>!weakOnly||isWeakQuestion(q,r)).map(q=>({setId:r.id,qid:q.id})));if(!pool.length){message('復習できる問題がありません');return}pool=pool.sort(()=>Math.random()-.5);quiz={pool,index:0,picked:null,sessionCorrect:0};navigate('quiz',quiz)}
function quizPage(){
 if(!quiz?.pool?.length){navigate('review');return}const cur=quiz.pool[quiz.index],r=records.find(x=>x.id===cur.setId),q=r?.questions.find(x=>x.id===cur.qid);if(!q){navigate('review');return}const done=quiz.picked!==null;
 frame(`<div class="quiz-shell"><div class="quiz-head"><strong>問題 ${quiz.index+1} / ${quiz.pool.length}</strong><button id="quit" class="btn ghost sm">終了</button></div><div class="card quiz-card">${done?`<div class="answer-result ${quiz.picked===q.answer?'result-correct':'result-wrong'}" role="status">${quiz.picked===q.answer?'正解':'不正解'}</div><div class="answer-summary"><span>あなたの回答：${quiz.picked?'○':'×'}</span><span>正しい答え：${q.answer?'○':'×'}</span></div><div class="segmented"><button id="show-explanation" class="btn primary sm">解説</button><button id="show-question" class="btn ghost sm">問題文</button></div><div class="quiz-reading" tabindex="0" id="quiz-explanation"><p>${escape(q.explanation)}</p>${q.trap?`<p><b>要点：</b>${escape(q.trap)}</p>`:''}${q.reference?`<p class="smalltext">出典：${escape(q.reference)}</p>`:''}</div><div class="quiz-reading" tabindex="0" id="quiz-question" hidden><p class="question">${escape(q.statement)}</p></div><div class="button-group quiz-actions"><button id="mark-weak" class="btn ghost sm">${q.weak?'苦手登録を解除':'苦手に登録'}</button><button id="next" class="btn primary">${quiz.index===quiz.pool.length-1?'結果を見る':'次の問題 →'}</button></div>`:`<p class="smalltext">${escape(r.exam)}</p><div class="quiz-reading" tabindex="0"><p class="question">${escape(q.statement)}</p></div><div class="answer-grid"><button id="ans-true" class="answer-choice">○ 正しい</button><button id="ans-false" class="answer-choice">× 誤り</button></div>`}</div></div>`);
 if(!done){document.getElementById('ans-true').onclick=()=>answer(true);document.getElementById('ans-false').onclick=()=>answer(false)}else{
  const tab=question=>{document.getElementById('quiz-question').hidden=!question;document.getElementById('quiz-explanation').hidden=question;document.getElementById('show-question').className='btn sm '+(question?'primary':'ghost');document.getElementById('show-explanation').className='btn sm '+(question?'ghost':'primary')};document.getElementById('show-explanation').onclick=()=>tab(false);document.getElementById('show-question').onclick=()=>tab(true);
  document.getElementById('mark-weak').onclick=async()=>{try{const questions=r.questions.map(item=>item.id===q.id?{...item,weak:!q.weak}:item);await persist({...r,questions});quizPage()}catch(e){message('保存できません：'+e.message)}};document.getElementById('next').onclick=()=>{quiz.index++;quiz.picked=null;if(quiz.index>=quiz.pool.length)results();else quizPage()}
 }document.getElementById('quit').onclick=()=>navigate('review');
}

async function answer(value){
 if(quiz.picked!==null||quiz.saving)return;const session=quiz,c=session.pool[session.index],r=records.find(x=>x.id===c.setId),original=r.questions.find(x=>x.id===c.qid),q={...original};session.saving=true;
 document.getElementById('ans-true').disabled=true;document.getElementById('ans-false').disabled=true;
 q.attempts=(q.attempts||0)+1;const today=new Date().toISOString().slice(0,10);
 if(value===q.answer){q.correct=(q.correct||0)+1;if(q.lastSuccessDay!==today){q.successDays=(q.successDays||0)+1;q.lastSuccessDay=today}if(q.successDays>=3){q.mastered=true;q.weak=false}}else{q.weak=true;q.mastered=false;q.successDays=0;q.lastSuccessDay=''}q.lastAnsweredAt=new Date().toISOString();
 try{await persist({...r,questions:r.questions.map(item=>item.id===q.id?q:item)});session.picked=value;if(value===q.answer)session.sessionCorrect++;if(quiz===session&&route==='quiz')quizPage()}catch(e){message('解答を保存できません：'+e.message);if(quiz===session&&route==='quiz')quizPage()}finally{session.saving=false}
}

function results(){const total=quiz.pool.length,correct=quiz.sessionCorrect;frame(`<div class="quiz-shell"><div class="card" style="text-align:center;padding:50px 24px"><h1 class="headline">復習結果</h1><div style="font-size:48px;color:var(--cyan);font-weight:900">${correct} / ${total}</div><p>正答率 ${Math.round(correct/total*100)}%</p><div class="button-group" style="justify-content:center"><button class="btn primary" data-go="review">もう一度復習</button><button class="btn ghost" data-go="library">問題集を見る</button></div></div></div>`);quiz=null;}
function preferences(){
 frame(`<h1 class="page-title">設定</h1><div class="segmented"><button class="btn primary" id="settings-data">データ</button><button class="btn ghost" id="settings-about">このアプリについて</button></div><div class="card" id="data-pane"><h2>バックアップ</h2><p class="smalltext">画像・類題・学習履歴は、このブラウザ内に保存されます。写真アプリやドライブには自動保存されません。</p><p class="smalltext">サイトデータを削除すると消えます。必要なデータは書き出してください。</p><div class="button-group"><button id="export" class="btn primary">バックアップ保存</button><label class="btn ghost" for="import-file">復元する</label><input id="import-file" hidden type="file" accept="application/json,.json"></div><p class="smalltext">${records.length}セット / ${getStats().questions}問</p><button class="btn danger sm" id="erase">全データを削除</button></div><div class="card" id="about-pane" hidden><h2>LoopQ プレビュー版</h2><p>Web版の類題作成はChatGPTとの手動連携です。写真は自動送信されません。</p><p>AIの正答・法令・出典は、ご自身で一次資料を確認してください。</p><p class="smalltext">iPhone実機での検証は継続中です。</p></div>`);
 const tab=about=>{document.getElementById('data-pane').hidden=about;document.getElementById('about-pane').hidden=!about;document.getElementById('settings-data').className='btn '+(about?'ghost':'primary');document.getElementById('settings-about').className='btn '+(about?'primary':'ghost')};document.getElementById('settings-data').onclick=()=>tab(false);document.getElementById('settings-about').onclick=()=>tab(true);
 document.getElementById('export').onclick=backup;document.getElementById('import-file').onchange=importBackup;document.getElementById('erase').onclick=async()=>{if(!confirm('写真・全問題・解答履歴を完全に削除します。取り消せません。実行しますか？'))return;try{await tx('readwrite',s=>s.clear());removedPhotos.clear();await refresh();message('学習データを削除しました');preferences()}catch(e){message('削除できません：'+e.message)}};
}

function saveSettings(){localStorage.setItem(SETTING,JSON.stringify(settings))}
function backup(){const content={format:'loopq.v2',exportedAt:new Date().toISOString(),records};const blob=new Blob([JSON.stringify(content)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='loopq-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);message('バックアップを保存しました')}
async function importBackup(e){const file=e.target.files?.[0];if(!file)return;if(file.size>75*1024*1024){message('バックアップのサイズが大きすぎます');return}try{const data=JSON.parse(await file.text());if(data.format!=='loopq.v2'||!Array.isArray(data.records))throw Error('形式が違います');if(data.records.length>10000)throw Error('件数が多すぎます');const cleaned=LoopQSafety.validateBackup(data);if(!confirm(`${cleaned.length}件のセットを端末に追加します。既存IDは上書きされます。よいですか？`))return;await tx('readwrite',s=>{for(const r of cleaned)s.put(r)});await refresh();message('復元しました');preferences()}catch(err){message('復元できません：'+err.message)}}
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
window.addEventListener('hashchange',()=>render());document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));document.getElementById('top-settings').onclick=()=>navigate('settings');
readDB().then(async x=>{db=x;await refresh();render();if('serviceWorker'in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{})}).catch(e=>{el.innerHTML=`<div class="content"><div class="notice warn">保存機能を開始できませんでした。ブラウザのプライベートモード設定を確認してください：${escape(e.message)}</div></div>`});
})();
