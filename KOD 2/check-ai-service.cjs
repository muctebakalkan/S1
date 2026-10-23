#!/usr/bin/env node
// Read-only deployment check. No AI calls, user creation, or secrets in output.
const config = require('../config/supabase.public.json');
(async () => {
 const url = config.url || config.supabaseUrl;
 const key = config.anonKey || config.key || config.supabaseAnonKey;
 if (!url || !key) throw new Error('Public connection config is missing.');
 const response = await fetch(`${url}/functions/v1/ai-assistant`, {
  method:'POST', signal:AbortSignal.timeout(15000),
  headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
  body:JSON.stringify({action:'deployment_check'}),
 });
 const data = await response.json().catch(()=>({}));
 const protectedFunction = response.status===401 && data.code==='AI_AUTH_REQUIRED';
 console.log(JSON.stringify({status:response.status,code:data.code||'UNKNOWN',deployedAndRejectsAnonymous:protectedFunction,liveAnalysisVerified:false},null,2));
 if(!protectedFunction)process.exitCode=1;
})().catch(()=>{console.error('AI service could not be checked. No credentials logged.');process.exitCode=1;});
