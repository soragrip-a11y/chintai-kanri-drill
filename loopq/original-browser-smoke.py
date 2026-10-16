"""Real Chromium + IndexedDB smoke. Serve repo at 127.0.0.1:8767 first.
Optional first argument: a private original-question JSON fixture, never committed.
"""
import json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
URL='http://127.0.0.1:8767/loopq/'
fixture=json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv)>1 else {'title':'合成問題','exam':'試験','questions':[{'originalId':str(i+1),'topic':f'分野{i//8+1}','statement':f'合成問題 {i+1}\n改行を保存','answer':i%2==0,'explanation':'合成の解説','reference':'合成の出典'} for i in range(168)]}
READ="""() => new Promise((resolve,reject)=>{const open=indexedDB.open('loopq-library-v2');open.onsuccess=()=>{const db=open.result,req=db.transaction('sources').objectStore('sources').getAll();req.onsuccess=()=>{resolve(req.result);db.close()};req.onerror=()=>reject(req.error)}})"""
SEED="""row => new Promise((resolve,reject)=>{const open=indexedDB.open('loopq-library-v2');open.onsuccess=()=>{const db=open.result,tx=db.transaction('sources','readwrite');tx.objectStore('sources').add(row);tx.oncomplete=()=>{db.close();resolve()};tx.onabort=()=>reject(tx.error)}})"""
old={'id':'legacy-test','exam':'既存試験','title':'既存の学習履歴','topic':'メモ','image':None,'createdAt':'2026-10-01T00:00:00Z','status':'manual','weak':True,'questions':[{'id':'legacy-q','statement':'以前の問題','answer':False,'explanation':'以前の解説','reference':'出典','trap':'要点','attempts':5,'correct':2,'weak':True,'successDays':0,'lastSuccessDay':''}]}
def upload(page,payload):
 page.goto(URL+'#original');page.wait_for_selector('#original-file');page.locator('#original-file').set_input_files({'name':'questions.json','mimeType':'application/json','buffer':json.dumps(payload,ensure_ascii=False).encode()});page.wait_for_function("document.getElementById('original-feedback').textContent.includes('問を読み取りました')")
def save(page):page.locator('#original-save').click()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(390,844),(1366,900)]:
  ctx=browser.new_context(viewport={'width':width,'height':height});ctx.add_init_script("localStorage.setItem('loopq-settings-v2',JSON.stringify({aiUseNoticeVersion:1,exam:'初期資格'}))")
  page=ctx.new_page();errors=[];page.on('pageerror',lambda error:errors.append(str(error)));page.goto(URL);page.wait_for_selector('#home-all');page.evaluate(SEED,old);page.reload();page.wait_for_selector('#home-all')
  upload(page,fixture);assert page.locator('#original-exam').input_value()==fixture['exam'];assert str(len(fixture['questions']))+'問' in page.locator('#original-feedback').inner_text()
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  save(page);page.wait_for_selector('#ans-true');assert '/ 168' in page.locator('.quiz-head').inner_text()
  rows=page.evaluate(READ);new=[r for r in rows if r['id']!='legacy-test'];assert len(new)==21;assert all(len(r['questions'])==8 for r in new)
  qs={q['originalId']:q for r in new for q in r['questions']}
  for q in fixture['questions']:
   for key in ['statement','answer','explanation','reference','sourcePage','answerPage']:
    if key in q:assert qs[q['originalId']][key]==q[key],(q['originalId'],key)
  assert next(r for r in rows if r['id']=='legacy-test')==old
  page.locator('#ans-false').click();page.wait_for_selector('.answer-result');assert sum(q['attempts'] for r in page.evaluate(READ) if r['id']!='legacy-test' for q in r['questions'])==1
  upload(page,fixture);save(page);page.wait_for_function("document.getElementById('original-feedback').textContent.includes('取り込み済み')");assert len(page.evaluate(READ))==22
  # Force an abort after the first new row and verify actual IndexedDB rollback.
  payload={'title':'原子性テスト','exam':'試験','questions':[{'statement':'追加1','answer':True,'topic':'分野a'},{'statement':'追加2','answer':False,'topic':'分野b'}]};upload(page,payload)
  page.evaluate("window.originalAdd=IDBObjectStore.prototype.add;window.addCalls=0;IDBObjectStore.prototype.add=function(...args){if(++window.addCalls===2)throw new DOMException('test quota','QuotaExceededError');return window.originalAdd.apply(this,args)}")
  save(page);page.wait_for_function("document.getElementById('original-feedback').textContent.includes('保存できません')");assert len(page.evaluate(READ))==22;assert page.locator('#original-text').input_value()
  page.evaluate('IDBObjectStore.prototype.add=window.originalAdd')
  # Missing answers are review-only; malicious markup must remain text.
  unknown={'exam':'試験','questions':[{'statement':'<img src=x onerror="window.injected=true">\n正答不明','answer':None}]};upload(page,unknown);page.locator('#original-preview-title').click();assert page.locator('#original-preview img').count()==0;save(page);page.wait_for_selector('.original-question-detail');page.locator('.original-question-detail summary').click();assert '正答未確認' in page.locator('#detail-questions').inner_text();assert page.locator('#quiz-source').count()==0;assert page.evaluate('window.injected') is None
  rows=page.evaluate(READ);assert len(rows)==23;assert next(r for r in rows if r['id']=='legacy-test')==old
  # Backup validation round-trip exercises all original metadata and history.
  restored=page.evaluate("async()=>{const open=await new Promise((ok,no)=>{const r=indexedDB.open('loopq-library-v2');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});const rows=await new Promise(ok=>{const r=open.transaction('sources').objectStore('sources').getAll();r.onsuccess=()=>ok(r.result)});const output=[];for(const p of LoopQBackup.parts(rows))output.push(...LoopQSafety.validateBackup(JSON.parse(await p.text())));open.close();return output}")
  orig={r['id']:r for r in rows}
  for r in restored:
   for q in r['questions']:
    before=next(x for x in orig[r['id']]['questions'] if x['id']==q['id'])
    for k,v in before.items():assert q[k]==v,(k,q)
  page.goto(URL+'#home');page.wait_for_selector('#home-all');page.evaluate("async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready}");page.reload();page.wait_for_selector('#home-all');ctx.set_offline(True);page.reload();page.wait_for_selector('#home-all');assert len(page.evaluate(READ))==23;assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1')
  page.screenshot(path=f'/tmp/loopq-original-{width}.png',full_page=True);assert not errors,errors
  print(f'PASS {width}px: 168 originals/21 sets, exact fixture fields, existing history, grading, duplicate guard, atomic quota rollback, null answers, XSS, backup, offline restart, no overflow')
  ctx.close()
 browser.close()
