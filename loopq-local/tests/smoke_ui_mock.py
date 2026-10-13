from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'index.html').read_text()
html=html.replace('<link rel="stylesheet" href="./style.css"><link rel="stylesheet" href="./bright.css">','<style>'+(root/'style.css').read_text()+(root/'bright.css').read_text()+'</style>')
for tag in ['./runtime-config.js','./ai-bridge.js','./safety.js','./app.js']:
 html=html.replace(f'<script src="{tag}" defer></script>','')
pre=r'''
const M=new Map(), kv=new Map();
Object.defineProperty(window,'localStorage',{value:{getItem:k=>kv.get(k)||null,setItem:(k,v)=>kv.set(k,v)}});
const transact=()=>{const t={oncomplete:null,onerror:null,objectStore:()=>({getAll:()=>{const req={};setTimeout(()=>{req.result=[...M.values()];req.onsuccess?.()},0);return req},put:(x)=>{M.set(x.id,structuredClone(x));setTimeout(()=>t.oncomplete?.(),0)},delete:(id)=>{M.delete(id);setTimeout(()=>t.oncomplete?.(),0)},clear:()=>{M.clear();setTimeout(()=>t.oncomplete?.(),0)}})};return t};
Object.defineProperty(window,'indexedDB',{value:{open:()=>{const req={result:{createObjectStore:()=>{},transaction:transact}};setTimeout(()=>req.onsuccess?.(),0);return req}}});
window.LoopQAI={enabled:true,mode:'local',status:async()=>({connected:false,sharing:false}),connect:async()=>{throw Error('mock')},models:async()=>({models:[]})};
'''
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for width,height in [(390,844),(1366,900)]:
  page=b.new_page(viewport={'width':width,'height':height})
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  page.set_content(html,wait_until="domcontentloaded",timeout=10000)
  page.add_script_tag(content=pre+(root/'safety.js').read_text()+(root/'app.js').read_text())
  page.wait_for_selector('h1',timeout=10000)
  page.screenshot(path=str(root/f'tests/home-{width}.png'),full_page=True)
  assert page.locator('[data-go="capture"]').count()>0
  page.locator('button[data-nav="capture"]:visible').first.click()
  page.locator('#source-topic').fill('民法の原状回復、通常損耗と特約の関係')
  page.locator('#save-source').click()
  page.wait_for_timeout(160)
  assert page.locator('#open-handoff').count()==1
  page.locator('#open-handoff').click()
  page.wait_for_timeout(130)
  assert page.locator('#ai-local-card').is_visible()
  assert page.locator('#ai-connect').is_visible()
  assert page.locator('#copy-prompt').count()==1
  assert page.locator('.manual-fallback').count()==1
  page.screenshot(path=str(root/f'tests/detail-{width}.png'),full_page=True)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),f'Overflow: {width}'
  assert not errors,errors
  print(f'PASS {width}px: home -> save -> AI connection -> fallback, no overflow')
 b.close()
