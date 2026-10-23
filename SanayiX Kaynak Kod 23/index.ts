import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { FleetError, FleetItem, fleetKey, parseFleetQuery, fetchFleetDataset, selectFleetPage } from './provider.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Content-Type':'application/json'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:cors});
serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return reply({error:'Geçersiz yöntem.'},405);
 try{
  const query=parseFleetQuery(await req.json().catch(()=>null));
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const policy=await db.from('vehicle_make_policy').select('name,display_name').eq('enabled',true);
  if(policy.error)throw policy.error;
  const whitelist=new Map((policy.data??[]).map(r=>[fleetKey(r.name),r.display_name]));
  let stale=false;
  const dataset=async(kind:'brands'|'models'|'variants',parent?:string):Promise<FleetItem[]>=>{
   const key=`fleet-v1:${kind}:${parent??'all'}`;
   const saved=await db.from('vehicle_catalog_cache').select('items,expires_at,fetched_at').eq('cache_key',key).maybeSingle();
   if(saved.error)throw saved.error;
   if(saved.data&&Date.parse(saved.data.expires_at)>Date.now())return saved.data.items;
   const old=saved.data&&Date.parse(saved.data.fetched_at)>Date.now()-90*86400000?saved.data.items:null;
   const token=crypto.randomUUID();
   const lock=await db.rpc('claim_vehicle_catalog_refresh',{p_key:key,p_token:token});if(lock.error)throw lock.error;
   if(!lock.data){if(old){stale=true;return old;}throw new FleetError('CATALOG_BUSY','Araç listesi hazırlanıyor. Biraz sonra tekrar deneyin.',429);}
   try{
    const items=await fetchFleetDataset(kind,parent,async()=>{const r=await db.rpc('take_vehicle_catalog_request');if(r.error)throw r.error;return r.data===true;});
    const stored=await db.rpc('finish_vehicle_catalog_refresh',{p_key:key,p_token:token,p_items:items,p_ttl_hours:kind==='brands'?720:168});
    if(stored.error||stored.data!==true)throw stored.error??new Error('Cache write failed');
    return items;
   }catch(error){
    await db.rpc('fail_vehicle_catalog_refresh',{p_key:key,p_token:token,p_cooldown_seconds:error instanceof FleetError&&error.code==='PROVIDER_LIMIT'?900:60});
    if(old){stale=true;return old;}throw error;
   }
  };
  const makes=(await dataset('brands')).filter(m=>whitelist.has(fleetKey(m.name))).map(m=>({...m,name:whitelist.get(fleetKey(m.name))||m.name}));
  let rows=makes;
  if(query.kind!=='brands'){
   if(!makes.some(m=>m.id===query.brandId))throw new FleetError('MAKE_NOT_ALLOWED','Bu marka şu anda listede değil.',400);
   rows=await dataset('models',query.brandId);
   if(['variants','years'].includes(query.kind)){
    if(!rows.some(m=>m.id===query.modelId))throw new FleetError('MODEL_NOT_FOUND','Model seçilen markaya ait değil.',400);
    rows=await dataset('variants',query.modelId);
   }
  }
  return reply({...selectFleetPage(rows,query),stale});
 }catch(error){return reply({code:error instanceof FleetError?error.code:'CATALOG_UNAVAILABLE',error:error instanceof FleetError?error.message:'Araç kataloğu yüklenemedi. Lütfen tekrar deneyin.'},error instanceof FleetError?error.status:502);}
});
