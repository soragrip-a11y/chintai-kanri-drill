"""LoopQ local OpenAI plan-use test gateway (Windows, loopback only).

Uses documented OSS dynamic registration and a per-user Windows DPAPI-encrypted
session file. No app/operator OpenAI API key and NO paid API fallback.
"""
from __future__ import annotations
import argparse
import base64
import hashlib
import json
import os
import re
import secrets
import sys
import threading
import time
import uuid
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qs
import requests
import jwt
from jwt import PyJWKClient

APP_NAME = 'LoopQ'
AUTH_URL = 'https://auth.openai.com/api/accounts/authorize'
TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token'
JWKS_URL = 'https://auth.openai.com/.well-known/jwks.json'
ISSUER = 'https://auth.openai.com'
RESOURCE = 'https://api.openai.com/v1'
SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct'

class UserVisibleError(Exception):
    pass

class DPAPIStore:
    """Keep tokens encrypted to the logged-on Windows user; never publish them."""
    def __init__(self, folder: Path):
        self.folder = folder
        self.folder.mkdir(parents=True, exist_ok=True)
        self.secret = folder / 'session.dpapi'
        self.meta = folder / 'host.json'
        if not self.meta.exists():
            self.meta.write_text(json.dumps({'host_id': 'urn:uuid:' + str(uuid.uuid4()), 'client_id': None}), encoding='utf-8')
        self.metadata = json.loads(self.meta.read_text(encoding='utf-8'))

    def _win32(self):
        if sys.platform != 'win32':
            raise UserVisibleError('この認証付きローカル版はWindowsのDPAPI暗号化が必要です。')
        try:
            import win32crypt
            return win32crypt
        except ImportError as e:
            raise UserVisibleError('認証を保存するには pip install pywin32 が必要です。') from e

    def save_meta(self):
        tmp = self.meta.with_suffix('.tmp')
        tmp.write_text(json.dumps(self.metadata), encoding='utf-8')
        os.replace(tmp, self.meta)

    def save_tokens(self, data):
        crypto = self._win32()
        packed = json.dumps(data).encode('utf-8')
        ciphertext = crypto.CryptProtectData(packed, 'LoopQ ChatGPT session', None, None, None, 0)
        tmp = self.secret.with_suffix('.tmp')
        tmp.write_bytes(ciphertext)
        os.replace(tmp, self.secret)

    def load_tokens(self):
        if not self.secret.exists():
            return None
        crypto = self._win32()
        try:
            payload = crypto.CryptUnprotectData(self.secret.read_bytes(), None, None, None, 0)[1]
            return json.loads(payload.decode('utf-8'))
        except Exception as e:
            raise UserVisibleError('保存したChatGPT認証情報を復号できません。再接続してください。') from e

    def clear(self):
        self.secret.unlink(missing_ok=True)

class AuthEngine:
    def __init__(self, store: DPAPIStore, port: int, client=None):
        self.store, self.port = store, port
        self.session = None
        self.pending = None
        self.lock = threading.RLock()
        self.client = client or requests.Session()

    def _token(self):
        with self.lock:
            if self.session is None:
                self.session = self.store.load_tokens()
            token = self.session
            if not token:
                raise UserVisibleError('ChatGPT未接続です。PC版の設定から接続してください。')
            # Fail closed if the signed-in account has not granted both required scopes.
            granted = set((token.get('scope') or '').split())
            if not {'chatgpt.tokens.use.direct', 'resource.invoke'} <= granted:
                raise UserVisibleError('ChatGPT本人利用枠の使用許可がありません。再接続してください。')
            if time.time() < token.get('expiry', 0) - 90:
                return token['access_token']
            if not token.get('refresh_token'):
                raise UserVisibleError('認証の有効期限が切れています。再接続してください。')
            response = self.client.post(TOKEN_URL, data={
                'grant_type':'refresh_token', 'client_id':token['client_id'],
                'refresh_token':token['refresh_token'], 'resource':RESOURCE
            }, timeout=25)
            if not response.ok:
                raise UserVisibleError('ChatGPTの認証更新に失敗しました。再接続してください。')
            new = response.json()
            scope = new.get('scope', token.get('scope',''))
            if 'chatgpt.tokens.use.direct' not in scope.split():
                raise UserVisibleError('ChatGPT利用枠の権限がありません。')
            if new.get('id_token'):
                signing=PyJWKClient(JWKS_URL).get_signing_key_from_jwt(new['id_token']).key
                claims=jwt.decode(new['id_token'],signing,algorithms=['RS256','ES256'],
                    audience=token['client_id'],issuer=ISSUER,options={'require':['exp','iat','sub']},leeway=5)
                if claims['sub'] != token.get('subject'):
                    raise UserVisibleError('更新した認証情報のアカウントが一致しません。')
            token.update(access_token=new['access_token'],
                         refresh_token=new.get('refresh_token',token['refresh_token']),
                         expiry=time.time()+int(new.get('expires_in',3600)),scope=scope)
            self.store.save_tokens(token)
            return token['access_token']

    def status(self):
        try:
            token = self._token()
            return {'mode':'local', 'connected':bool(token), 'sharing':True,
                    'account':self.session.get('email','ChatGPTアカウント'),
                    'billing':'ChatGPT本人利用枠のみ（上限超過時は停止）'}
        except UserVisibleError as e:
            return {'mode':'local','connected':False,'sharing':False,'message':str(e)}

    def start(self):
        with self.lock:
            if self.pending and time.time() - self.pending['started'] < 300:
                raise UserVisibleError('認証処理が進行中です。ブラウザーで続行してください。')
            state = secrets.token_urlsafe(32)
            nonce = secrets.token_urlsafe(32)
            verifier = secrets.token_urlsafe(64)
            redirect = f'http://127.0.0.1:{self.port}/auth/callback'
            self.pending = {'state':state,'nonce':nonce,'verifier':verifier,'redirect':redirect,'started':time.time()}
            params = {
                'client_id': self.store.metadata.get('client_id') or 'dynamic_agent_client',
                'response_type':'code', 'redirect_uri':redirect,
                'scope':SCOPES, 'resource':RESOURCE,
                'state':state,'nonce':nonce,
                'code_challenge_method':'S256',
                'code_challenge':base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('='),
                'ext_agent_host_id':self.store.metadata['host_id'],
            }
            if params['client_id'] == 'dynamic_agent_client':
                params['agent_name_hint'] = APP_NAME
            return AUTH_URL+'?'+urlencode(params)

    def callback(self, query):
        with self.lock:
            p = self.pending
            self.pending = None
        if not p or time.time()-p['started']>300:
            raise UserVisibleError('認証が期限切れです。やり直してください。')
        if not secrets.compare_digest((query.get('state') or [''])[0],p['state']):
            raise UserVisibleError('認証状態を確認できません。やり直してください。')
        if 'error' in query:
            raise UserVisibleError('ChatGPTの認証がキャンセルされました。')
        code = (query.get('code') or [''])[0]
        client_id = (query.get('client_id') or [self.store.metadata.get('client_id')])[0]
        if not code or not client_id or client_id=='dynamic_agent_client':
            raise UserVisibleError('認証コードまたは発行済みクライアントIDがありません。')
        existing = self.store.metadata.get('client_id')
        if existing and existing != client_id:
            raise UserVisibleError('登録されたクライアントIDが一致しません。')
        # Persist issued ID even if token exchange fails, to avoid duplicate registrations.
        self.store.metadata['client_id'] = client_id
        self.store.save_meta()
        response = self.client.post(TOKEN_URL,data={
            'grant_type':'authorization_code','client_id':client_id,'code':code,
            'code_verifier':p['verifier'],'redirect_uri':p['redirect'],'resource':RESOURCE
        },timeout=30)
        if not response.ok:
            raise UserVisibleError('ChatGPT認証コードを交換できませんでした。')
        data = response.json()
        if not data.get('id_token'):
            raise UserVisibleError('ChatGPTのIDトークンが返りませんでした。')
        key = PyJWKClient(JWKS_URL).get_signing_key_from_jwt(data['id_token']).key
        claims = jwt.decode(data['id_token'],key,algorithms=['RS256','ES256'],
            audience=client_id,issuer=ISSUER,options={'require':['exp','iat','sub']},leeway=5)
        if claims.get('nonce') != p['nonce']:
            raise UserVisibleError('認証nonceが一致しません。')
        scopes = data.get('scope','')
        if 'chatgpt.tokens.use.direct' not in scopes.split() or 'resource.invoke' not in scopes.split():
            raise UserVisibleError('ChatGPT本人利用枠の権限が付与されていません。')
        token = {
            'client_id':client_id,'access_token':data['access_token'],
            'refresh_token':data.get('refresh_token'),
            'expiry':time.time()+int(data.get('expires_in',3600)),
            'scope':scopes,'subject':claims['sub'],'email':claims.get('email') or claims.get('name') or '接続済み'
        }
        self.store.save_tokens(token)
        with self.lock:
            self.session = token

    def models(self):
        bearer = self._token()
        res = self.client.get(RESOURCE+'/models',headers={'Authorization':'Bearer '+bearer},timeout=25)
        if not res.ok:
            raise UserVisibleError('利用可能なモデルを取得できません。ChatGPTの利用枠と接続状態を確認してください。')
        data = res.json()
        values = data.get('models',[])
        return [{'slug':m.get('slug'),'name':m.get('display_name') or m.get('slug')}
                for m in values if m.get('visibility')=='list' and isinstance(m.get('slug'),str)][:30]

    def _respond(self, model, text, image=None, instructions=None):
        payload={'model':model,'store':False,'stream':True}
        parts = [{'type':'input_text','text':text}]
        if image:
            parts.append({'type':'input_image','image_url':image})
        payload['input']=[{'role':'user','content':parts}]
        if instructions:
            payload['instructions']=instructions
        res=self.client.post(RESOURCE+'/responses',json=payload,
            headers={'Authorization':'Bearer '+self._token(),'Content-Type':'application/json'},
            timeout=(15,180),stream=True)
        if not res.ok:
            code=''
            try: code=(res.json().get('error') or {}).get('code','')
            except Exception: pass
            raise UserVisibleError(f'ChatGPTで生成できません（HTTP {res.status_code} / {code or "接続・権限・利用上限を確認"}）。有料APIへの切替はしません。')
        chunks=[];completed=False
        # SSE lines; allow cancellation/failure without returning incomplete outputs.
        for raw in res.iter_lines(decode_unicode=True):
            if not raw: continue
            if isinstance(raw, bytes): raw=raw.decode('utf-8','replace')
            if not raw.startswith('data:'):continue
            line=raw[5:].strip()
            if line=='[DONE]':continue
            try: event=json.loads(line)
            except ValueError: continue
            typ=event.get('type')
            if typ=='response.output_text.delta':
                delta=event.get('delta','')
                if not isinstance(delta,str):
                    raise UserVisibleError('AI応答の形式が不正です。保存しません。')
                chunks.append(delta)
                if sum(map(len,chunks))>90_000:
                    raise UserVisibleError('AI応答が長すぎます。問題は保存されません。')
            if typ=='response.completed':
                completed=True
                if not chunks:
                    for item in event.get('response',{}).get('output',[]):
                        for part in item.get('content',[]):
                            if part.get('type')=='output_text':chunks.append(part.get('text',''))
            if typ in ('response.failed','response.incomplete','error'):
                raise UserVisibleError('ChatGPTが生成を完了できませんでした。利用枠・モデル・入力形式を確認してください。')
        if not completed:raise UserVisibleError('ChatGPTの応答が途中で終了しました。問題は保存されません。')
        return ''.join(chunks)

    @staticmethod
    def parse_questions(output):
        text=output.strip()
        if text.startswith('```'):
            text=re.sub(r'^```(?:json)?\s*','',text)
            text=re.sub(r'\s*```\s*$','',text)
        try:obj=json.loads(text)
        except ValueError:raise UserVisibleError('AIの回答がJSON形式ではありません。保存しません。')
        items=obj.get('questions') if isinstance(obj,dict) else None
        if not isinstance(items,list) or len(items)!=3:
            raise UserVisibleError('類題がちょうど3問ではありません。保存しません。')
        for q in items:
            if not isinstance(q,dict) or type(q.get('answer')) is not bool:
                raise UserVisibleError('正答形式が不正です。')
            for field in ['statement','explanation','reference','trap']:
                if not isinstance(q.get(field),str) or (field in ('statement','explanation') and not q[field].strip()) or len(q[field])>5000:
                    raise UserVisibleError('問題文または解説が不正です。')
        return items

    def generate(self, data):
        if not isinstance(data,dict): raise UserVisibleError('入力形式が不正です。')
        model=data.get('model')
        if not isinstance(model,str) or not re.fullmatch(r'[A-Za-z0-9._-]{1,100}',model):
            raise UserVisibleError('接続中のモデルを選択してください。')
        image=data.get('image')
        if not isinstance(image,str) or len(image)>5_500_000 or not re.fullmatch(r'data:image/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+',image):
            raise UserVisibleError('読み取れる写真が必要です（4MB以下）。')
        if not data.get('consent') is True:
            raise UserVisibleError('写真をChatGPTに送信する同意が必要です。')
        exam=str(data.get('exam','資格試験'))[:80]
        topic=str(data.get('topic',''))[:500]
        instructions=('あなたは資格試験の作問担当。写真から論点・例外・条件分岐・ひっかけ・難易度を判断する。'
          '元問題の創作的表現、固有事例、選択肢の順番は再使用しない。独立した現実的な応用事例の○×問題を正確に3問作る。'
          '根拠が特定できなければreferenceに「未確認」と書く。出力はquestions配列3件のJSONのみ。'
          '各要素はstatement,answer(boolean),explanation,reference,trap。試験水準を下げない。'
          '現行法令を実際に確認できない場合は確認したふりをしない。')
        text=f'資格: {exam}\nつまずいた点: {topic}\n画像を読み込み、新しい応用問題を3問生成してください。'
        generated=self._respond(model,text,image=image,instructions=instructions)
        questions=self.parse_questions(generated)
        check_prompt=(f'次の3問を独立に監査してください。問題文・正答・解説間の矛盾、例外、数値、'
          f'元問題と独立した事例かを評価する。疑わしい内容はapproved=falseとし、根拠不明を明記。'
          f'全体を{{"approved":true/false,"reason":"..."}}というJSONだけで返す。\n'+json.dumps(questions,ensure_ascii=False))
        checked=self._respond(model,check_prompt)
        try:
            verification=json.loads(re.sub(r'^```(?:json)?\s*|\s*```$','',checked.strip()))
        except ValueError:
            raise UserVisibleError('生成した3問の再検証に失敗しました。保存しません。')
        if verification.get('approved') is not True:
            raise UserVisibleError('AIによる再検証で疑義が見つかりました。問題を採用しません。'+str(verification.get('reason',''))[:100])
        # AI reviewing AI ≠ verified current law. Let the user approve after comparing sources.
        return {'questions':questions,'status':'review_required','note':'AIの独立した再検証は通過。ただし法令・出典の専門家確認は未完了です。'}

    def logout(self):
        with self.lock:
            self.session=None
            self.store.clear()

ROOT=Path(__file__).resolve().parent.parent
if not (ROOT/'index.html').is_file() and (ROOT.parent/'loopq'/'index.html').is_file():
    ROOT=ROOT.parent/'loopq'
MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'}

def make_handler(engine):
    class Handler(BaseHTTPRequestHandler):
        server_version='LoopQ-local/0.1'
        def send_json(self,obj,code=200):
            payload=json.dumps(obj,ensure_ascii=False).encode('utf-8')
            self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)
        def _allowed(self):
            # No CORS. Reject cross-origin JavaScript or form-POST; loopback only.
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin','')
            if host not in (f'127.0.0.1:{engine.port}',):return False
            if origin and origin!=f'http://127.0.0.1:{engine.port}':return False
            return True
        def do_GET(self):
            if not self._allowed():return self.send_json({'error':'host拒否'},403)
            u=urlparse(self.path)
            try:
                if u.path=='/api/status':return self.send_json(engine.status())
                if u.path=='/api/models':return self.send_json({'models':engine.models()})
                if u.path=='/auth/callback':
                    try: engine.callback(parse_qs(u.query));msg='ChatGPTの接続が完了しました。LoopQへ戻ります。'
                    except UserVisibleError as e:msg=str(e)
                    page=f'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="3;url=/loopq/#settings"><title>LoopQ接続</title><p>{msg}</p><a href="/loopq/#settings">LoopQに戻る</a>'
                    data=page.encode('utf-8');self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
                if u.path in ('/','/loopq'):self.send_response(302);self.send_header('Location','/loopq/');self.end_headers();return
                if u.path=='/loopq/runtime-config.js':
                    body="window.LoopQRuntimeConfig={mode:'local',apiBase:'',allowLocalPlan:true};".encode()
                    self.send_response(200);self.send_header('Content-Type','application/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
                if not u.path.startswith('/loopq/'):
                    return self.send_json({'error':'見つかりません'},404)
                name=u.path.removeprefix('/loopq/') or 'index.html'
                base=ROOT.resolve();file=(base/name).resolve()
                if not file.is_relative_to(base) or not file.is_file() or file.suffix not in MIME:
                    return self.send_json({'error':'見つかりません'},404)
                buf=file.read_bytes();self.send_response(200);self.send_header('Content-Type',MIME[file.suffix]);self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(buf)));self.end_headers();self.wfile.write(buf)
            except UserVisibleError as e: self.send_json({'error':str(e)},400)
            except Exception as e:
                print('GET error',type(e).__name__,file=sys.stderr);self.send_json({'error':'処理に失敗しました'},500)
        def do_POST(self):
            if not self._allowed() or self.headers.get('X-LoopQ-Request')!='1':
                return self.send_json({'error':'認証済み画面から操作してください'},403)
            length=int(self.headers.get('Content-Length','0') or '0')
            if length>6_000_000:return self.send_json({'error':'写真が大きすぎます'},413)
            try:
                data=json.loads(self.rfile.read(length).decode('utf-8')) if length else {}
                if self.path=='/api/auth/start':return self.send_json({'url':engine.start()})
                if self.path=='/api/generate':return self.send_json(engine.generate(data))
                if self.path=='/api/logout':engine.logout();return self.send_json({'connected':False})
                return self.send_json({'error':'見つかりません'},404)
            except UserVisibleError as e:return self.send_json({'error':str(e)},400)
            except Exception as e:
                print('POST error',type(e).__name__,file=sys.stderr);return self.send_json({'error':'処理中に問題が発生しました'},500)
        def log_message(self,fmt,*args):
            # No tokens, OAuth codes, image data, URLs with secrets in logs.
            if self.path.startswith('/auth/callback'):return
            print(f'LoopQ {self.command} {self.path.split("?")[0]}',file=sys.stderr)
    return Handler

def start(port=8765,open_browser=True,store=None):
    store=store or DPAPIStore(Path(os.getenv('APPDATA') or (Path.home()/'.loopq'))/'LoopQ')
    engine=AuthEngine(store,port)
    httpd=ThreadingHTTPServer(('127.0.0.1',port),make_handler(engine))
    engine.port=httpd.server_port
    print(f'LoopQ local: http://127.0.0.1:{httpd.server_port}/loopq/')
    if open_browser: threading.Timer(.5, lambda:webbrowser.open(f'http://127.0.0.1:{httpd.server_port}/loopq/')).start()
    try:httpd.serve_forever()
    except KeyboardInterrupt:pass
    finally:httpd.server_close()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8765);parser.add_argument('--no-browser',action='store_true');options=parser.parse_args()
    start(options.port,not options.no_browser)
