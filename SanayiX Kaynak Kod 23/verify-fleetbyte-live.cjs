// Integration check: public mobile key -> SanayiX backend -> database cache -> FleetByte.
// No user data or private credentials are used.
const fs=require('node:fs'),assert=require('node:assert/strict');
const config=require('../config/supabase.public.json');
const source=JSON.parse(fs.readFileSync('/private/tmp/sanayix-fleetbyte-research/report.json'));
const output='/private/tmp/sanayix-fleetbyte-live.json';
const report={at:new Date().toISOString(),checks:[],passed:false};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function request(body){
 for(let i=0;i<4;i++){
  const response=await fetch(config.url+'/functions/v1/fleet-vehicle-catalog',{method:'POST',headers:{apikey:config.anonKey,Authorization:`Bearer ${config.anonKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(80000)});
  const data=await response.json();
  if(response.status===429&&data.code==='CATALOG_BUSY'){console.log('Cache request budget reached; waiting for the next minute.');await delay(61000);continue;}
  return {status:response.status,data};
 }
 throw Error('Catalog busy after retries');
}
async function page(q){const r=await request(q);assert.equal(r.status,200,JSON.stringify(r.data));assert.equal(r.data.source,'FleetByte');return r.data;}
async function all(q){let rows=[],offset=0;for(;;){const p=await page({...q,offset});rows.push(...p.items);if(p.nextOffset===null){assert.equal(rows.length,p.total);return rows}offset=p.nextOffset;}}
(async()=>{
 const makes=await all({kind:'brands'});assert.ok(makes.length>=50&&makes.length<=65);assert.ok(!makes.some(m=>/harley|trailer/i.test(m.name)));report.makeCount=makes.length;
 for(const item of source.checks){
  const make=makes.find(m=>m.name.toLowerCase()===item.brand.toLowerCase());assert.ok(make,item.brand);
  const models=await all({kind:'models',brandId:make.id});
  if(item.missing){report.checks.push({brand:item.brand,model:item.name,missingExact:true,matchingNames:models.filter(m=>m.name.toLowerCase().includes(item.name.split(' ').at(-1).toLowerCase())).map(m=>m.name)});continue;}
  const model=models.find(m=>m.id===item.modelId);assert.ok(model);if(item.brand==='FIAT')assert.equal(model.name,'Egea');
  const variants=await all({kind:'variants',brandId:make.id,modelId:model.id});assert.equal(variants.length,item.variantCount);
  const years=await all({kind:'years',brandId:make.id,modelId:model.id});assert.ok(years.length);assert.equal(Math.min(...years.map(y=>Number(y.name))),item.minYear);
  const known=variants.find(v=>v.yearFrom&&v.fuelType&&v.gearboxType);assert.ok(known);
  const filtered=await all({kind:'variants',brandId:make.id,modelId:model.id,year:known.yearFrom,fuelType:known.fuelType,gearboxType:known.gearboxType});
  assert.ok(filtered.some(v=>v.id===known.id));assert.ok(filtered.every(v=>v.yearFrom<=known.yearFrom&&(v.yearTo==null||v.yearTo>=known.yearFrom)&&v.fuelType===known.fuelType&&v.gearboxType===known.gearboxType));
  const second=await all({kind:'variants',brandId:make.id,modelId:model.id});assert.deepEqual(second,variants);
  report.checks.push({brand:item.brand,model:model.name,variants:variants.length,yearCount:years.length,filteredCount:filtered.length,repeatedReadPassed:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
  console.log(item.brand,model.name,variants.length,'variants; year/fuel/gear and repeated reads passed');await delay(6000);
 }
 const first=source.checks[0];assert.equal((await request({kind:'variants',brandId:source.checks[1].makeId,modelId:first.modelId})).status,400);
 assert.equal((await request({kind:'models',brandId:'not-a-uuid'})).status,400);
 report.passed=true;fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Live catalogue checks passed.');
})().catch(e=>{report.error=e.message;fs.writeFileSync(output,JSON.stringify(report,null,2));console.error(e.message);process.exitCode=1;});
