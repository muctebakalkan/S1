const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const files=['supabase/functions/_shared/vehicleNames.ts','lib/marketplaceVehicles.ts','lib/vehicleCatalog.ts','lib/vehicleCatalogSupplement.ts','lib/vehicleFilterChoices.ts','lib/spareParts.ts'];
const c=vm.createContext({Date,Number,Set,Map,Promise,Error});
for(const file of files)vm.runInContext(stripTypeScriptTypes(fs.readFileSync(file,'utf8')).replace(/^import .*;$/gm,'').replace(/export /g,''),c);
const run=(name,...args)=>{c.args=args;return vm.runInContext(`${name}(...args)`,c);};
const plain=x=>JSON.parse(JSON.stringify(x));
const blank={brand:'',model:'',year:'',engine:''};
const client=fn=>({rpc:async(name,q)=>{assert.equal(name,'sanayix_vehicle_catalog');return {data:await fn(q.p_query),error:null}}});
const page=items=>({items,total:items.length,nextOffset:null});
const options=(field,selection,extra={})=>({field,selection,search:'',offset:0,fitments:Promise.resolve([]),...extra});
for(const [brand,model,engine] of [['Fiat','500','1.2'],['Mini','Cooper','1.5'],['Nissan','Micra','1.2'],['Honda','Civic','1.6 i-VTEC']]) {
 test(`${brand}: catalogue uppercase names find both compatible parts and engine choices`,()=>{
  const fitments=[{brand,model,yearFrom:2010,yearTo:2020,engine}];
  const selection={brand:brand.toUpperCase(),model:model.toUpperCase(),year:2018,engine:engine.toUpperCase()};
  assert.equal(run('checkCompatibility',fitments,selection).level,'exact');
  assert.deepEqual(plain(run('vehicleFilterOptions',fitments,{...selection,year:'2018'})).engine,[engine]);
 });
}
test('model generations and engine identifiers stay distinct',()=>{
 assert.notEqual(run('vehicleNameKey','Clio V'),run('vehicleNameKey','Clio'));
 assert.equal(run('checkCompatibility',[{brand:'Renault',model:'Clio V',yearFrom:2020,yearTo:2023,engine:'1.0 TCe'}],{brand:'Renault',model:'Clio',year:2021,engine:'1.0 TCe'}).level,'none');
});
test('provider ID replaces duplicate local name while distinct generations remain',()=>{
 const result=plain(run('appendCatalogPage',[{id:'local:fiat',name:'Fiat'},{id:'local:clio v',name:'Clio V'}],[{id:492,name:'FIAT'},{id:12,name:'Clio'}]));
 assert.equal(result.length,3);assert.equal(result.find(r=>r.name==='FIAT').id,492);
});
test('saved name lookup compares international casing and missing names are nonfatal',async()=>{
 const api=client(async q=>page(q.q==='Dacia'?[]:[{id:492,name:'FIAT'}]));
 assert.equal((await run('resolveCatalogName',api,'brands','Fiat')).id,492);
 assert.equal(await run('resolveCatalogName',api,'brands','Dacia'),null);
});
test('years come from selected model variants, including pre-1996 when reported',async()=>{
 const calls=[];const api=client(async q=>{calls.push(q);return page([{id:'1990',name:'1990'},{id:'1991',name:'1991'}])});
 const result=await run('loadVehicleFilterChoices',api,options('year',{...blank,brand:'Renault',model:'Clio'},{brand:{id:1,name:'Renault'},model:{id:2,name:'Clio'}}));
 assert.deepEqual(plain(result.items).map(r=>r.name),['1991','1990']);assert.equal(calls.length,1);assert.equal(calls[0].kind,'years');assert.equal(calls[0].modelId,2);
});
test('saved and listing models survive a sparse Renault catalogue',async()=>{
 const api=client(async q=>q.kind==='brands'?page([{id:13647,name:'RENAULT'}]):page([{id:5,name:'Alliance'}]));
 const result=await run('loadVehicleFilterChoices',api,options('model',{...blank,brand:'Renault'}, {saved:{brand:'Renault',model:'Clio V',year:2021,engine:'1.0 TCe'},fitments:Promise.resolve([{brand:'Renault',model:'Megane',yearFrom:2018,yearTo:2022,engine:'1.3 TCe'}])}));
 for(const name of ['Clio V','Megane','Alliance'])assert.ok(result.items.some(r=>r.name===name),name);
 assert.equal(result.error,'');assert.ok(!result.items.some(r=>r.name==='Megane Sedan'));
});
test('Dacia works without a provider make ID and does not issue an invalid model request',async()=>{
 const calls=[];const result=await run('loadVehicleFilterChoices',client(async q=>{calls.push(q);return page([])}),options('model',{...blank,brand:'Dacia'},{saved:{brand:'Dacia',model:'Sandero'}}));
 assert.ok(result.items.some(r=>r.name==='Sandero'));assert.equal(calls.length,1);assert.equal(calls[0].kind,'brands');assert.equal(result.error,'');
});
test('local search is case independent and excludes other brands',async()=>{
 const api=client(async()=>page([]));
 const result=await run('loadVehicleFilterChoices',api,options('model',{...blank,brand:'FIAT'},{search:'egea',fitments:Promise.resolve([{brand:'Fiat',model:'Egea'},{brand:'Renault',model:'Clio'}])}));
 assert.deepEqual(plain(result.items).map(r=>r.name),['Egea']);
});
test('network failure preserves saved choices and a subsequent retry really reloads',async()=>{
 let offline=true,calls=0;const api=client(async()=>{calls++;if(offline)throw Error('offline');return page([{id:474,name:'HONDA'}])});
 const input=options('brand',blank,{saved:{brand:'Renault',model:'Clio V'}});
 const failed=await run('loadVehicleFilterChoices',api,input);assert.match(failed.error,/yüklenemedi/);assert.ok(failed.items.some(r=>r.name==='Renault'));
 offline=false;const retry=await run('loadVehicleFilterChoices',api,input);assert.equal(retry.error,'');assert.ok(retry.items.some(r=>r.name==='HONDA'));assert.equal(calls,2);
});
test('engine choices work without a year, and filter known ranges when year is selected',async()=>{
 const fitments=Promise.resolve([{brand:'Fiat',model:'Egea',yearFrom:2020,yearTo:2021,engine:'1.4'},{brand:'Fiat',model:'Egea',yearFrom:2022,yearTo:2023,engine:'1.6'}]);
 const api=client(async()=>{throw Error('provider unavailable')});
 let result=await run('loadVehicleFilterChoices',api,options('engine',{...blank,brand:'FIAT',model:'Egea'},{fitments}));
 assert.deepEqual(plain(result.items).map(r=>r.name),['1.4','1.6']);
 result=await run('loadVehicleFilterChoices',api,options('engine',{...blank,brand:'FIAT',model:'Egea',year:'2020'},{fitments}));
 assert.deepEqual(plain(result.items).map(r=>r.name),['1.4']);
});
test('unknown engines are not fabricated from other models or years',async()=>{
 const result=await run('loadVehicleFilterChoices',client(async()=>page([])),options('engine',{...blank,brand:'Fiat',model:'Egea',year:'1990'},{fitments:Promise.resolve([{brand:'Fiat',model:'500',yearFrom:2010,yearTo:2022,engine:'1.2'}])}));
 assert.equal(result.items.length,0);assert.equal(result.error,'');
});
test('local failure still shows the remote catalogue, with a recoverable error',async()=>{
 const result=await run('loadVehicleFilterChoices',client(async()=>page([{id:474,name:'HONDA'}])),options('brand',blank,{fitments:Promise.reject(Error('offline'))}));
 assert.ok(result.items.some(r=>r.name==='HONDA'));assert.match(result.error,/İlanlardaki/);
});

test('reopening a selected engine replaces its local fallback and retains distinct production ranges', async () => {
 const brand={id:'00000000-0000-4000-8000-000000000001',name:'Renault'};
 const model={id:'00000000-0000-4000-8000-000000000002',name:'Clio'};
 const variants=[
  {id:'00000000-0000-4000-8000-000000000003',name:'III - 1.2 16V (75 Hp)',yearFrom:2009,yearTo:2010},
  {id:'00000000-0000-4000-8000-000000000004',name:'III - 1.2 16V (75 Hp)',yearFrom:2010,yearTo:2012}
 ];
 const selection={brand:'Renault',model:'Clio',year:'2010',engine:variants[0].name};
 const result=await run('loadVehicleFilterChoices',client(async()=>page(variants)),options('engine',selection,{brand,model}));
 assert.equal(result.items.length,2);
 assert.deepEqual(new Set(result.items.map(r=>r.id)),new Set(variants.map(r=>r.id)));
 // Loading another page cannot reinsert a saved-label duplicate.
 const merged=run('appendCatalogPage',result.items,[{id:'local:engine',name:selection.engine},variants[1]]);
 assert.equal(merged.length,2);
});
test('only one equal-name variant is selected, preserving the clicked production range', () => {
 const items=[{id:'range1',name:'1.2',yearFrom:2009,yearTo:2010},{id:'range2',name:'1.2',yearFrom:2010,yearTo:2012}];
 assert.equal(run('selectedCatalogItemId',items,'1.2',items[1]),'range2');
 assert.equal(run('selectedCatalogItemId',items,'1.2'),'range1');
 assert.equal(run('selectedCatalogItemId',items,'1.5',items[1]),undefined);
 assert.equal(run('selectedCatalogItemId',items.slice(0,1),'1.2',items[1]),'range1');
});

test('engine selector automatically loads all 126 options, including those beyond the first page', async()=>{
 const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const variants=Array.from({length:126},(_,i)=>({id:uuid(i+10),name:'Engine '+i,yearFrom:2010,yearTo:2015}));
 const calls=[];const api=client(async q=>{calls.push(q);return {items:variants.slice(q.offset,q.offset+100),total:126,nextOffset:q.offset===0?100:null}});
 const result=await run('loadVehicleFilterChoices',api,options('engine',{...blank,brand:'Opel',model:'Astra',year:'2012'},{brand:{id:uuid(1),name:'Opel'},model:{id:uuid(2),name:'Astra'}}));
 assert.equal(result.items.length,126);assert.equal(result.nextOffset,null);assert.equal(result.error,'');
 assert.ok(result.items.some(x=>x.id===uuid(135)));
 assert.deepEqual(calls.map(q=>q.offset),[0,100]);assert.ok(calls.every(q=>q.year===2012&&q.modelId===uuid(2)));
});
test('later engine-page failures are explicit, not a successful incomplete list', async()=>{
 const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const api=client(async q=>{if(q.offset)throw Error('second page offline');return {items:[{id:uuid(3),name:'1.2'}],total:2,nextOffset:1}});
 const result=await run('loadVehicleFilterChoices',api,options('engine',{...blank,brand:'Opel',model:'Astra',year:'2012'},{brand:{id:uuid(1),name:'Opel'},model:{id:uuid(2),name:'Astra'}}));
 assert.equal(result.items.length,0);assert.match(result.error,/second page offline/);
});
test('closing or changing an engine selection stops requests for subsequent pages', async()=>{
 let active=true,calls=0;const api=client(async()=>{calls++;active=false;return {items:[{id:1,name:'1.2'}],total:2,nextOffset:1}});
 await assert.rejects(run('loadVehicleVariantChoices',api,{kind:'variants'},()=>active),/seçimi değişti/);assert.equal(calls,1);
});
test('engine paging rejects inconsistent totals, repeated IDs and truncated last pages', async()=>{
 for(const mode of ['total','duplicate','truncated']){
  const api=client(async q=>q.offset?{items:mode==='truncated'?[]:[{id:mode==='duplicate'?1:2,name:'Engine'}],total:mode==='total'?3:2,nextOffset:null}:{items:[{id:1,name:'Engine'}],total:2,nextOffset:1});
  await assert.rejects(run('loadVehicleVariantChoices',api,{kind:'variants'}));
 }
});
