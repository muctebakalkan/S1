const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function setup({authenticated=true,key='test-key',status=200,providerBody,fetchError}={}) {
 let handler,calls=[];
 const ctx=vm.createContext({Request,Response,FormData,File,AbortSignal,Error, serve:fn=>handler=fn,
  Deno:{env:{get:name=>name==='OPENAI_API_KEY'?key:'test'}},
  createClient:()=>({auth:{getUser:async()=>({data:{user:authenticated?{id:'test'}:null},error:null})}}),
  fetch:async(url,options)=>{calls.push({url,options}); if(fetchError)throw fetchError; return new Response(JSON.stringify(providerBody??{choices:[{message:{content:JSON.stringify({damageType:'Fren sistemi',possibleAction:'Usta kontrolü',urgencyLevel:'high'})}}]}),{status});}
 });
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('supabase/functions/ai-assistant/index.ts','utf8')).replace(/^import .*;$/gm,''),ctx);
 return {calls, run:async(body={action:'analyze_text',description:'Fren basmiyor'}, method='POST')=>{
 const res=await handler(new Request('https://example.test',{method,headers:{Authorization:'Bearer test',...(body instanceof FormData?{}:{'Content-Type':'application/json'})},body:method==='POST'?(body instanceof FormData?body:JSON.stringify(body)):undefined}));
 return {status:res.status,body:method==='OPTIONS'?await res.text():await res.json(),headers:res.headers};
 }};
}
test('anonymous requests never reach the provider',async()=>{const h=setup({authenticated:false});const r=await h.run();assert.equal(r.status,401);assert.equal(r.body.code,'AI_AUTH_REQUIRED');assert.equal(h.calls.length,0);});
test('missing server key is an explicit configuration error and cannot call AI',async()=>{const h2=setup({key:''});const r=await h2.run();assert.equal(r.status,503);assert.equal(r.body.code,'AI_NOT_CONFIGURED');assert.equal(h2.calls.length,0);});
test('CORS and method checks work without paid requests',async()=>{const h=setup();assert.equal((await h.run({},'OPTIONS')).headers.get('Access-Control-Allow-Methods'),'POST, OPTIONS');assert.equal((await h.run({},'GET')).status,405);assert.equal(h.calls.length,0);});
test('text and photo analyses preserve the client contract',async()=>{const h=setup();assert.equal((await h.run()).body.result.damageType,'Fren sistemi');assert.equal((await h.run({action:'analyze_image',imageBase64:'dGVzdA=='})).status,200);assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.options.signal));});
test('invalid inputs cannot consume AI requests',async()=>{const h=setup();for(const body of [null,[],{}, {action:'analyze_text',description:{}},{action:'analyze_text',description:''},{action:'analyze_image',imageBase64:''}])assert.equal((await h.run(body)).status,400);assert.equal(h.calls.length,0);});
for(const [status,providerBody,expected,code] of [[401,{error:{message:'private key'}},503,'AI_PROVIDER_AUTH'],[429,{error:{code:'insufficient_quota'}},503,'AI_QUOTA_EXCEEDED'],[429,{},429,'AI_RATE_LIMITED'],[500,{},502,'AI_UNAVAILABLE']])test(`provider ${status} returns ${code} without leaking details`,async()=>{const h=setup({status,providerBody});const r=await h.run();assert.equal(r.status,expected);assert.equal(r.body.code,code);assert.ok(!JSON.stringify(r).includes('private key'));assert.equal(h.calls.length,1);});
test('invalid model JSON and timeouts return safe errors',async()=>{assert.equal((await setup({providerBody:{choices:[{message:{content:'not JSON'}}]}}).run()).body.code,'AI_INVALID_RESPONSE');const e=new Error('secret');e.name='TimeoutError';assert.equal((await setup({fetchError:e}).run()).status,504);});
test('audio input uses the same errors and rejects empty files',async()=>{const form=new FormData();form.append('action','transcribe');form.append('file',new File(['audio'],'recording.m4a',{type:'audio/m4a'}));const h=setup({providerBody:{text:'Fren basmıyor'}});assert.equal((await h.run(form)).body.text,'Fren basmıyor');assert.ok(h.calls[0].url.endsWith('/audio/transcriptions'));const empty=new FormData();empty.append('action','transcribe');empty.append('file',new File([],'empty.m4a'));assert.equal((await h.run(empty)).status,400);});
test('part compatibility keeps its response envelope',async()=>{const h=setup({providerBody:{choices:[{message:{content:'{"verdict":"belirsiz","answer":"OEM kontrolü gerekli"}'}}]}});assert.equal((await h.run({action:'part_compatibility',payload:{}})).body.result.verdict,'belirsiz');});
