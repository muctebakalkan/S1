// Read-only API checks using the existing public mobile key. No account is created.
const fs=require('node:fs'),assert=require('node:assert/strict');
const config=require('../config/supabase.public.json');
const report={at:new Date().toISOString(),checks:[],passed:false};
const out=process.argv[2]||'/private/tmp/sanayix-purchased-live.json';
async function request(query){
 const r=await fetch(config.url+'/rest/v1/rpc/sanayix_vehicle_catalog',{method:'POST',headers:{apikey:config.anonKey,Authorization:'Bearer '+config.anonKey,'Content-Type':'application/json'},body:JSON.stringify({p_query:query}),signal:AbortSignal.timeout(20000)});
 return {status:r.status,data:await r.json()};
}
async function all(q){let rows=[],offset=0;for(let page=0;page<30;page++){
 const r=await request({...q,offset});assert.equal(r.status,200,JSON.stringify(r.data));
 assert.equal(r.data.yearMode,'self-reported');assert.equal(r.data.yearFilterApplied,false);
 assert.ok(r.data.items.length<=100);rows.push(...r.data.items);
 assert.ok(r.data.items.every(i=>!('source_ids'in i)&&!('source_path'in i)));
 if(r.data.nextOffset===null){assert.equal(rows.length,r.data.total);assert.equal(new Set(rows.map(i=>i.id)).size,rows.length);return rows;}
 assert.ok(r.data.nextOffset>offset);offset=r.data.nextOffset;
 }throw Error('Incomplete pagination');}
(async()=>{
 const brands=await all({kind:'brands'});assert.equal(brands.length,105);report.brands=brands.length;
 assert.ok(brands.every(b=>!/^Elektrikli /u.test(b.name)&&!/[ÃÄÅ�]/u.test(b.name)));
 const citroen=brands.find(b=>b.name==='Citroen');assert.ok(citroen);
 const citroenModels=await all({kind:'models',brandId:citroen.id});assert.ok(citroenModels.some(m=>m.name==='C-Elysée'));

 const expected=[['Fiat','Egea',7],['Renault','Clio',20],['Renault','Megane',21],['Ford','Tourneo Courier',4],['Ford','Transit Courier',7],['Ford','Focus',14],['Volkswagen','Golf',15],['Volkswagen','Passat',19],['Toyota','Corolla',9],['Hyundai','i20',6],['Peugeot','3008',10],['Opel','Astra',19],['BMW','iX',3],['BMW','iX1',2],['BMW','X1',9],['BMW','X5',11],['Audi','Q8',3],['Lexus','RX',5],['Fiat','500 Ailesi',13]];
 for(const [brand,model,count] of expected){
  const b=brands.find(i=>i.name===brand);assert.ok(b,brand);
  const models=await all({kind:'models',brandId:b.id,q:model});const m=models.find(i=>i.name===model);assert.ok(m,model);
  const q={kind:'variants',brandId:b.id,modelId:m.id,year:2020};const engines=await all(q);
  assert.equal(engines.length,count,model);assert.ok(engines.every(i=>i.yearCoverage==='unspecified'&&!('yearFrom'in i)));
  report.checks.push({brand,model,count,modelId:m.id});
 }
 const y=await all({kind:'years',brandId:26,modelId:584});assert.equal(y[0].name,String(new Date().getFullYear()+1));assert.equal(y.at(-1).name,'1900');
 assert.deepEqual(await all({kind:'variants',brandId:26,modelId:584,year:2010}),await all({kind:'variants',brandId:26,modelId:584,year:2020}));
 for(const q of [{kind:'models',brandId:0},{kind:'variants',brandId:27,modelId:584},{kind:'brands',offset:-1},{kind:'brands',q:42},{kind:'variants',brandId:26,modelId:584,year:9999},{kind:'variants',brandId:26,modelId:584,gearboxType:'Automatic'}])assert.equal((await request(q)).status,400);
 assert.equal((await all({kind:'brands',q:'%'})).length,0);
 assert.equal((await all({kind:'brands',q:'FIAT'}))[0].name,'Fiat');
 const privateRead=await fetch(config.url+'/rest/v1/sanayix_catalog_entries?select=id&limit=1',{headers:{apikey:config.anonKey,Authorization:'Bearer '+config.anonKey}});
 assert.ok([401,403].includes(privateRead.status));report.privateTableProtected=true;
 report.passed=true;fs.writeFileSync(out,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{report.error=e.message;fs.writeFileSync(out,JSON.stringify(report,null,2));console.error(e.message);process.exitCode=1;});
