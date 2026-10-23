const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function setup(response = {}, thrown) {
 let calls = 0;
 const ctx = vm.createContext({ supabase: { functions: { invoke: async () => { calls++; if (thrown) throw thrown; return response; } } } });
 const code = stripTypeScriptTypes(fs.readFileSync('lib/aiService.ts', 'utf8')).replace(/^import .*;$/gm, '').replace(/export /g, '');
 vm.runInContext(code, ctx);
 return { ctx, calls: () => calls };
}
function http(status, body) { return { name: 'FunctionsHttpError', context: new Response(JSON.stringify(body), {status}) }; }
for (const [status, code, expected] of [[404,'NOT_FOUND','AI_NOT_DEPLOYED'],[401,'','AI_AUTH_REQUIRED'],[403,'','AI_AUTH_REQUIRED'],[429,'','AI_RATE_LIMITED'],[413,'','AI_INVALID_INPUT'],[504,'','AI_TIMEOUT'],[503,'AI_NOT_CONFIGURED','AI_NOT_CONFIGURED'],[503,'AI_QUOTA_EXCEEDED','AI_QUOTA_EXCEEDED'],[503,'AI_PROVIDER_AUTH','AI_PROVIDER_AUTH']]) {
 test(`AI error ${status}/${code} becomes a safe Turkish message`, async () => {
  const {ctx,calls}=setup({error:http(status,{code,error:'private provider details'})});
  await assert.rejects(ctx.invokeAI({action:'analyze_text'}), e=>e.code===expected&&!e.message.includes('private')&&!e.message.includes('non-2xx'));
  assert.equal(calls(),1);
 });
}
test('HTML gateway errors and failed fetches do not leak raw responses', async () => {
 const {ctx}=setup();
 const error=await ctx.aiServiceError({context:new Response('<html>internal secret</html>',{status:502})});
 assert.equal(error.code,'AI_UNAVAILABLE');
 assert.equal((await ctx.aiServiceError({name:'FunctionsFetchError'})).code,'AI_NETWORK_ERROR');
 assert.equal((await ctx.aiServiceError({name:'AbortError'})).code,'AI_TIMEOUT');
 assert.equal((await ctx.aiServiceError(null)).code,'AI_UNAVAILABLE');
});
test('SDK exceptions and error envelopes are normalized without retry',async()=>{
 const a=setup({}, {name:'TypeError'});
 await assert.rejects(a.ctx.invokeAI({}), e=>e.code==='AI_NETWORK_ERROR'); assert.equal(a.calls(),1);
 const b=setup({data:{error:'secret',code:'AI_NOT_CONFIGURED'}});
 await assert.rejects(b.ctx.invokeAI({}), e=>e.code==='AI_NOT_CONFIGURED');
});
test('a valid AI result is passed through; missing or invalid results cannot appear successful',async()=>{
 const data={result:{damageType:'Fren sistemi',possibleAction:'Usta kontrolü'}};
 const {ctx}=setup({data});
 assert.equal((await ctx.invokeAI({})).result.damageType,'Fren sistemi');
 assert.equal(ctx.readAnalysisResult(data).urgencyLevel,'unknown');
 assert.equal(ctx.readAnalysisResult({result:{...data.result,possibleCauses:['a',{}],estimatedCost:{}}}).possibleCauses.length,1);
 for(const result of [null,'raw',[],{}, {damageType:'',possibleAction:'a'}]) assert.throws(()=>ctx.readAnalysisResult({result}),e=>e.code==='AI_INVALID_RESPONSE');
 await assert.rejects(setup({data:null}).ctx.invokeAI({}),e=>e.code==='AI_INVALID_RESPONSE');
});
