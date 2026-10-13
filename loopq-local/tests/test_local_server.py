import importlib.util
import io
import json
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from http.server import ThreadingHTTPServer
from pathlib import Path

SERVER=Path(__file__).resolve().parents[1] / 'local/server.py'
spec=importlib.util.spec_from_file_location('loopq_server',SERVER)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
class FakeStore:
    metadata={'host_id':'urn:uuid:28cc7e46-8c46-4ff5-ae47-c96f982def01','client_id':None}
    def load_tokens(self):return None
    def save_meta(self):pass
    def clear(self):pass
class LocalServerTests(unittest.TestCase):
    def setUp(self):
        self.engine=m.AuthEngine(FakeStore(),0)
        self.server=ThreadingHTTPServer(('127.0.0.1',0),m.make_handler(self.engine))
        self.engine.port=self.server.server_port
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
    def tearDown(self):self.server.shutdown();self.server.server_close()
    def req(self,method,path,body=None,headers=None):
        conn=HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        head=headers or {}
        if body is not None:
            head['Content-Type']='application/json';head['X-LoopQ-Request']='1'
            body=json.dumps(body)
        conn.request(method,path,body=body,headers=head)
        resp=conn.getresponse(); data=resp.read(); conn.close()
        return resp.status,data
    def test_static_pages(self):
        code,data=self.req('GET','/loopq/')
        self.assertEqual(code,200)
        self.assertIn(b'bright.css',data)
        code,data=self.req('GET','/loopq/runtime-config.js')
        self.assertEqual(code,200)
        self.assertIn(b"mode:'local'",data)
    def test_no_path_traversal(self):
        code,_=self.req('GET','/loopq/../local/server.py')
        self.assertEqual(code,404)
    def test_no_cross_origin_post(self):
        code,_=self.req('POST','/api/generate',{},headers={'Origin':'https://attacker.example'})
        self.assertEqual(code,403)
    def test_auth_pkce_start_no_browser(self):
        code,data=self.req('POST','/api/auth/start',{})
        self.assertEqual(code,200)
        from urllib.parse import urlparse,parse_qs
        u=urlparse(json.loads(data)['url'])
        q=parse_qs(u.query)
        self.assertEqual(q['client_id'],['dynamic_agent_client'])
        self.assertIn('chatgpt.tokens.use.direct',q['scope'][0])
        self.assertEqual(q['redirect_uri'],[f'http://127.0.0.1:{self.server.server_port}/auth/callback'])
    def test_fails_closed_not_connected(self):
        code,data=self.req('POST','/api/generate',{})
        self.assertEqual(code,400)
        self.assertNotIn(b'access_token',data)
    def test_questions_schema(self):
        q={'questions':[{'statement':f'説明{i}', 'answer':True,'explanation':'根拠','reference':'未確認','trap':'条件'} for i in range(3)]}
        self.assertEqual(len(m.AuthEngine.parse_questions(json.dumps(q))),3)
        q['questions'].append(q['questions'][0])
        with self.assertRaises(m.UserVisibleError):m.AuthEngine.parse_questions(json.dumps(q))
if __name__=='__main__':unittest.main()
