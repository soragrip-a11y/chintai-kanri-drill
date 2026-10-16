"""Synthetic browser/IndexedDB checks. Serve the repo on 127.0.0.1:8768 first.
Run: python loopq/quiz-resume-browser-smoke.py [base URL]
Chromium automation is not a physical iOS Safari/PWA test.
"""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
URL=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:8768/loopq/').rstrip('/')+'/'
OUT=Path('/tmp/loopq-resume-browser');OUT.mkdir(exist_ok=True)
READ="""store=>new Promise((ok,no)=>{const o=indexedDB.open('loopq-library-v2');o.onerror=()=>no(o.error);o.onsuccess=()=>{const db=o.result,r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>{ok(r.result);db.close()};r.onerror=()=>no(r.error)}})"""
rows=[{'id':'set-'+str(s),'exam':'合成試験','title':'合成セット '+str(s),'image':None,'topic':'保持するメモ','createdAt':'2026-10-01T00:00:00Z','status':'manual','weak':True,'questions':[{'id':f'q-{s}-{i}','statement':f'合成問題 {s}-{i}\n'+('条件を確認します。'*30 if i==1 else '本文です。'),'answer':i%2==0,'explanation':f'合成解説 {s}-{i}\n'+'解説を最後まで読めます。'*50,'reference':'合成出典','trap':'合成の要点','attempts':4,'correct':2,'weak':True,'successDays':0,'lastSuccessDay':''} for i in range(3)]} for s in range(2)]
def total(page):return sum(q['attempts'] for r in page.evaluate(READ,'sources') for q in r['questions'])
def state(page):return page.evaluate(READ,'quizSessions')
def answer(page,choice):
 page.wait_for_timeout(350)  # Navigation intentionally guards rapid repeat taps.
 page.locator('#ans-'+('true' if choice else 'false')).click();page.wait_for_selector('.answer-result')
def next_question(page):
 page.wait_for_timeout(350);page.locator('#next').click()
def position(page):return page.locator('#quiz-position').inner_text()
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(390,844),(320,568),(844,390),(1366,900)]:
  ctx=browser.new_context(viewport={'width':width,'height':height},service_workers='allow');ctx.add_init_script("localStorage.setItem('loopq-settings-v2',JSON.stringify({aiUseNoticeVersion:1,exam:'合成試験'}))")
  page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  # Start with a real v1 database, then load the upgraded application.
  page.route(URL,lambda r:r.fulfill(body='<!doctype html><html><body>Migration fixture</body></html>',content_type='text/html'));page.goto(URL)
  page.evaluate("""rows=>new Promise((ok,no)=>{const o=indexedDB.open('loopq-library-v2',1);o.onupgradeneeded=()=>o.result.createObjectStore('sources',{keyPath:'id'});o.onerror=()=>no(o.error);o.onsuccess=()=>{const db=o.result,t=db.transaction('sources','readwrite');rows.forEach(r=>t.objectStore('sources').put(r));t.oncomplete=()=>{db.close();ok()};t.onabort=()=>no(t.error)}})""",rows)
  page.unroute(URL);page.reload();page.wait_for_selector('#home-all');assert page.evaluate(READ,'sources')==rows
  page.goto(URL+'#detail/set-0');page.locator('#quiz-source').click();page.wait_for_selector('#ans-true');assert '1 / 3' in position(page)
  before=total(page);dock_before=page.locator('#next').bounding_box();assert page.locator('#next').is_disabled();answer(page,True);assert total(page)==before+1
  assert page.locator('#next').bounding_box()==dock_before
  next_question(page);page.wait_for_function("document.getElementById('quiz-position').textContent.includes('2 / 3')")
  answer(page,False);assert page.locator('#next').bounding_box()==dock_before;before=total(page)
  page.locator('#quit').click();page.wait_for_selector('[data-resume-quiz]');assert '2 / 3問 解答済み' in page.locator('.resume-quizzes').inner_text();page.reload();page.wait_for_selector('[data-resume-quiz]');page.locator('[data-resume-quiz]').first.click();page.wait_for_selector('.answer-result');assert '2 / 3' in position(page);assert 'あなたの回答：×' in page.locator('.answer-summary').inner_text();assert total(page)==before
  page.wait_for_timeout(350);page.locator('#previous').click();page.wait_for_function("document.getElementById('quiz-position').textContent.includes('1 / 3')");assert page.locator('#previous').is_disabled();assert 'あなたの回答：○' in page.locator('.answer-summary').inner_text();assert total(page)==before
  next_question(page);page.wait_for_function("document.getElementById('quiz-position').textContent.includes('2 / 3')");next_question(page);page.wait_for_function("document.getElementById('quiz-position').textContent.includes('3 / 3')");answer(page,False);assert page.locator('#next').bounding_box()==dock_before
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1');page.evaluate("document.getElementById('app').scrollTop=999999");reading=page.locator('#quiz-explanation').bounding_box();dock=page.locator('.quiz-dock').bounding_box();assert reading['y']+reading['height']<=dock['y']+1
  if width<=760:
   nav=page.locator('.mobile-nav').bounding_box();assert dock['y']+dock['height']<=nav['y']+1
  page.screenshot(path=str(OUT/f'quiz-{width}x{height}.png'),full_page=True)
  next_question(page);page.wait_for_selector('#home-all');assert state(page)==[];assert total(page)==before+1
  # Actual transactional abort after the source write must roll back both stores.
  page.locator('#home-all').click();page.wait_for_selector('#ans-true');before=total(page);checkpoint=state(page)
  page.evaluate("window.nativePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...xs){if(this.name==='quizSessions')throw new DOMException('simulated quota','QuotaExceededError');return window.nativePut.apply(this,xs)}")
  page.locator('#ans-true').click();page.wait_for_function("document.getElementById('toast').textContent.includes('解答を保存できません')");assert total(page)==before;assert state(page)==checkpoint;page.evaluate('IDBObjectStore.prototype.put=window.nativePut');answer(page,True);assert total(page)==before+1
  page.locator('#quit').click();page.wait_for_selector('[data-resume-quiz]');page.evaluate("async()=>{await navigator.serviceWorker.register('./sw.js');await navigator.serviceWorker.ready}");page.reload();page.wait_for_selector('[data-resume-quiz]');ctx.set_offline(True);page.reload();page.wait_for_selector('[data-resume-quiz]');page.locator('[data-resume-quiz]').first.click();page.wait_for_selector('.answer-result');assert total(page)==before+1
  assert not errors,errors;ctx.close();print(f'PASS {width}x{height}: v1 migration, exact counters, home/reload/previous, fixed Next, no overlap/overflow, atomic quota retry, finish, offline resume')
 browser.close()
