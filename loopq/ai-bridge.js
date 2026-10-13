/* Auth and inference adapter contract for local Windows now and approved hosted future.
 * No OAuth token or app-owner API key enters the browser JavaScript. */
(()=>{'use strict';
  const configuration=window.LoopQRuntimeConfig||{mode:'hosted-pending',apiBase:null};
  const local=configuration.mode==='local' && configuration.allowLocalPlan===true && location.hostname==='127.0.0.1';
  const hosted=configuration.mode==='hosted-approved' && configuration.approved===true && location.protocol==='https:' && configuration.apiBase===location.origin;
  const canUse=local||hosted;
  async function req(path,payload){
    if(!canUse)throw Error('公開Web版のChatGPT自動連携は承認待ちです。');
    const options={credentials:'same-origin',cache:'no-store',headers:{'X-LoopQ-Request':'1'}};
    if(payload!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(payload)}
    const res=await fetch((configuration.apiBase||'')+path,options);
    const obj=await res.json().catch(()=>({error:'無効な応答です'}));
    if(!res.ok)throw Error(obj.error||`通信失敗（HTTP ${res.status}）`);
    return obj;
  }
  window.LoopQAI=Object.freeze({
    get mode(){return configuration.mode},
    get enabled(){return canUse},
    status:()=>canUse?req('/api/status'):Promise.resolve({mode:configuration.mode,connected:false,sharing:false}),
    models:()=>req('/api/models'),
    async connect(){const r=await req('/api/auth/start',{});if(!r.url.startsWith('https://auth.openai.com/'))throw Error('不正な認証先です');window.location.assign(r.url);return true},
    generate:({model,image,exam,topic,consent})=>req('/api/generate',{model,image,exam,topic,consent}),
    logout:()=>req('/api/logout',{}),
  });
})();
