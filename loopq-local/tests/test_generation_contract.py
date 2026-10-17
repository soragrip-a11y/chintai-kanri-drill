"""Mocked OpenAI calls; no live billing or access to a ChatGPT account."""
import importlib.util
import json
import time
import unittest
from pathlib import Path
mfile=Path(__file__).resolve().parents[1]/'local/server.py'
spec=importlib.util.spec_from_file_location('loopq_local',mfile)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Store:
    metadata={'host_id':'urn:uuid:28cc7e46-8c46-4ff5-ae47-c96f982def01','client_id':'oaiapp_abc'}
    def load_tokens(self):return None
    def save_meta(self):pass
    def save_tokens(self,token):pass
    def clear(self):pass
class Response:
    ok=True
    def __init__(self,text):self.text=text
    def iter_lines(self,decode_unicode=False):
        yield ('data: '+json.dumps({'type':'response.output_text.delta','delta':self.text})).encode()
        yield b'data: '+json.dumps({'type':'response.completed','response':{'output':[]}}).encode()
class Client:
    def __init__(self):self.calls=[]
    def post(self,url,json=None,headers=None,timeout=None,stream=False,**kwargs):
        self.calls.append({'url':url,'payload':json,'header':headers})
        if len(self.calls)==1:
            q={'questions':[{'statement':f'民法の応用事例{i}', 'answer':i!=1,'explanation':'説明','reference':'未確認','trap':'時期'} for i in range(3)]}
            return Response(__import__('json').dumps(q,ensure_ascii=False))
        return Response('{"approved":true,"reason":"見た目上の矛盾はない"}')
class ContractTests(unittest.TestCase):
    def test_two_calls_only_user_oauth_and_image(self):
        fake=Client();a=m.AuthEngine(Store(),8765,client=fake)
        a.session={'access_token':'SYNTHETIC_USER_OAUTH','expiry':time.time()+3600,'scope':'chatgpt.tokens.use.direct resource.invoke','client_id':'oaiapp_abc'}
        data={'model':'gpt-6.1-sol','image':'data:image/jpeg;base64,'+'eA==','exam':'宅建','topic':'契約と通知','consent':True}
        result=a.generate(data)
        self.assertEqual(len(result['questions']),3)
        self.assertEqual(result['status'],'review_required')
        self.assertEqual(len(fake.calls),2)
        self.assertEqual(fake.calls[0]['header']['Authorization'],'Bearer SYNTHETIC_USER_OAUTH')
        self.assertIn('input_image',str(fake.calls[0]['payload']))
        for call in fake.calls:
            self.assertEqual(call['payload']['store'],False)
            self.assertEqual(call['payload']['stream'],True)
            self.assertEqual(call['url'],'https://api.openai.com/v1/responses')
    def test_no_consent_no_send(self):
        fake=Client();a=m.AuthEngine(Store(),8765,client=fake)
        with self.assertRaises(m.UserVisibleError):a.generate({'model':'gpt-6.1-sol','image':'data:image/jpeg;base64,eA==','consent':False})
        self.assertEqual(len(fake.calls),0)
    def test_missing_direct_plan_scope_blocks_inference(self):
        fake=Client();a=m.AuthEngine(Store(),8765,client=fake)
        a.session={'access_token':'synthetic','expiry':time.time()+3600,
                   'scope':'openid profile email','client_id':'oaiapp_abc'}
        with self.assertRaisesRegex(m.UserVisibleError,'利用枠の使用許可'):
            a._respond('gpt-6.1-sol','test')
        self.assertEqual(fake.calls,[])
    def test_user_plan_scope_but_missing_resource_scope_blocks_inference(self):
        fake=Client();a=m.AuthEngine(Store(),8765,client=fake)
        a.session={'access_token':'synthetic','expiry':time.time()+3600,
                   'scope':'chatgpt.tokens.use.direct','client_id':'oaiapp_abc'}
        with self.assertRaisesRegex(m.UserVisibleError,'利用枠の使用許可'):
            a._respond('gpt-6.1-sol','test')
        self.assertEqual(fake.calls,[])
    def test_invalid_model_never_sends_photograph(self):
        fake=Client();a=m.AuthEngine(Store(),8765,client=fake)
        with self.assertRaisesRegex(m.UserVisibleError,'モデル'):
            a.generate({'model':'@@not_a_model','image':'data:image/jpeg;base64,eA==','consent':True})
        self.assertEqual(fake.calls,[])
    def test_invalid_image_never_sends_photo(self):
        fake=Client();a=m.AuthEngine(Store(),8765,client=fake)
        with self.assertRaisesRegex(m.UserVisibleError,'写真'):
            a.generate({'model':'gpt-6.1-sol','image':'https://remote.example/photo.jpg','consent':True})
        self.assertEqual(fake.calls,[])
if __name__=='__main__':unittest.main()
