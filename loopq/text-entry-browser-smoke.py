"""Synthetic-only Chromium smoke for the text-first workflow.
Serve the repository at 127.0.0.1:8768 first. No external service is contacted.
Usage: python loopq/text-entry-browser-smoke.py [local LoopQ URL]
"""
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8768/loopq/'
if urlparse(URL).hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise ValueError('This test only runs against a local synthetic-data instance.')
RAW = '問1　合成の○×問題です。\n正答：○\n解説：合成の解説です。\n</textarea><img src=x onerror="window.injected=true">'
PAYLOAD = json.dumps({'format': 'loopq.original.v1', 'exam': '合成試験', 'title': '文章入力の合成テスト', 'questions': [
    {'originalId': str(i + 1), 'statement': f'合成問題{i + 1}', 'answer': i % 2 == 0, 'explanation': '合成の解説'} for i in range(8)
]}, ensure_ascii=False)
READ = """() => new Promise((resolve,reject)=>{const open=indexedDB.open('loopq-library-v2');open.onsuccess=()=>{const db=open.result,req=db.transaction('sources').objectStore('sources').getAll();req.onsuccess=()=>{resolve(req.result);db.close()};req.onerror=()=>reject(req.error)}})"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
    for width, height in [(390, 844), (1366, 900)]:
        context = browser.new_context(viewport={'width': width, 'height': height}, service_workers='block')
        context.add_init_script("localStorage.setItem('loopq-settings-v2',JSON.stringify({aiUseNoticeVersion:1,exam:'合成試験'}))")
        page = context.new_page()
        errors, external = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda req: external.append(req.url) if urlparse(req.url).hostname not in ('127.0.0.1', 'localhost', '::1', None) else None)
        page.goto(URL)
        page.locator('button[data-go="text"]').first.click()
        page.wait_for_selector('#text-source')
        assert page.locator('#text-copy-prompt').is_disabled()
        page.locator('#text-source').fill(RAW)
        page.locator('#text-exam').fill('保存する資格')
        assert not page.locator('#text-copy-prompt').is_disabled()
        assert page.locator('#text-entry img').count() == 0
        page.locator('#text-show-prompt').click()
        prompt = page.locator('#text-prompt').input_value()
        assert json.loads(prompt.splitlines()[-1]) == RAW
        assert '3問に制限せず' in prompt
        assert page.evaluate('window.injected') is None
        assert page.locator('#text-open-chatgpt').get_attribute('href') == 'https://chatgpt.com/'
        # Clipboard denied: manual copy remains usable and no success is claimed.
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied')}}})")
        page.locator('#text-copy-prompt').click()
        page.wait_for_function("document.getElementById('text-copy-status').textContent.includes('手動でコピー')")
        assert page.locator('#text-prompt').input_value() == prompt
        assert 'コピーしました' not in page.locator('#text-copy-status').inner_text()
        # Clipboard succeeds with a local in-memory test double.
        page.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.syntheticCopied=value}}})")
        page.locator('#text-copy-prompt').click()
        page.wait_for_function("document.getElementById('text-copy-status').textContent.includes('コピーしました')")
        assert page.evaluate('window.syntheticCopied') == prompt
        # Browser Back / Forward and reload preserve exact source and qualification.
        page.locator('#top-home').click()
        page.go_back()
        page.wait_for_selector('#text-source')
        assert page.locator('#text-source').input_value() == RAW
        page.go_forward()
        page.wait_for_selector('#home-all')
        page.locator('button[data-go="text"]').first.click()
        page.reload()
        page.wait_for_selector('#text-source')
        assert page.locator('#text-source').input_value() == RAW
        assert page.locator('#text-exam').input_value() == '保存する資格'
        # Source survives a visit to the separate JSON-return screen.
        page.locator('#text-import-response').click()
        page.wait_for_selector('#original-text')
        assert page.locator('#original-exam').input_value() == '保存する資格'
        page.go_back()
        page.wait_for_selector('#text-source')
        assert page.locator('#text-source').input_value() == RAW
        # Over-limit input remains intact for splitting, with no clipboard action.
        long_text = '合' * 100001
        page.locator('#text-source').fill(long_text)
        assert page.locator('#text-copy-prompt').is_disabled()
        assert '切り捨てていません' in page.locator('#text-inspect').inner_text()
        assert page.locator('#text-source').input_value() == long_text
        page.locator('#text-source').fill(RAW)
        # Storage failure retains current text and warns about reload.
        page.evaluate("window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='loopq-text-entry-draft-v1')throw new DOMException('synthetic quota','QuotaExceededError');return window.originalStorageSet.call(this,k,v)}")
        page.locator('#text-source').fill(RAW + '\n追記')
        assert '再読み込み' in page.locator('#text-draft-status').inner_text()
        page.locator('#top-home').click()
        page.locator('button[data-go="text"]').first.click()
        assert page.locator('#text-source').input_value() == RAW + '\n追記'
        page.evaluate('Storage.prototype.setItem=window.originalStorageSet')
        # A JSON paste goes straight to validated original import, retaining all 8 questions.
        page.locator('#text-source').fill('{"questions":[')
        assert page.locator('#text-format-section').is_hidden()
        assert '形式を確認できません' in page.locator('#text-inspect').inner_text()
        page.locator('#text-source').fill(PAYLOAD)
        assert '8問' in page.locator('#text-inspect').inner_text()
        assert page.locator('#text-format-section').is_hidden()
        assert len(page.evaluate(READ)) == 0
        page.locator('#text-import-detected').click()
        page.wait_for_selector('#original-text')
        assert page.locator('#original-text').input_value() == PAYLOAD
        assert '8問を読み取りました' in page.locator('#original-feedback').inner_text()
        page.locator('#original-save').click()
        page.wait_for_selector('#ans-true')
        rows = page.evaluate(READ)
        assert sum(len(row['questions']) for row in rows) == 8
        assert [q['statement'] for row in rows for q in row['questions']] == [f'合成問題{i + 1}' for i in range(8)]
        page.locator('#top-home').click()
        page.locator('button[data-go="text"]').first.click()
        page.locator('#text-source').fill(RAW)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        assert page.evaluate("document.getElementById('app').scrollWidth <= document.getElementById('app').clientWidth + 1")
        if width < 760:
            assert float(page.locator('#text-source').evaluate('e=>parseFloat(getComputedStyle(e).fontSize)')) >= 16
        page.screenshot(path=f'/tmp/loopq-text-entry-{width}.png', full_page=True)
        assert not errors, errors
        assert not external, external
        print(f'PASS {width}px: raw/JSON separation, 8-question import, exact prompt, XSS, copy fallback, Back/Forward, reload draft, quota, long text, no overflow or external requests')
        context.close()
    browser.close()
