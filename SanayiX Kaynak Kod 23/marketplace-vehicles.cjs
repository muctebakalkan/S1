const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=['supabase/functions/_shared/vehicleNames.ts','lib/marketplaceVehicles.ts'].map(p=>stripTypeScriptTypes(fs.readFileSync(p,'utf8')).replace(/^import .*;$/gm,'').replace(/export /g,'')).join('\n');
const ctx=vm.createContext({Date,Number,Set,Map}); vm.runInContext(source,ctx);
const call=(name,...args)=>{ctx.args=args;return vm.runInContext(`${name}(...args)`,ctx);};
const plain=value=>JSON.parse(JSON.stringify(value));
const blank={brand:'',model:'',year:'',engine:''};
const catalog=call('normalizeVehicleFitments',[
 {brand:' Renault ',model:'Clio',yearFrom:2020,yearTo:2022,engine:'1.0 TCe'},
 {brand:'RENAULT',model:'Clio',yearFrom:2017,yearTo:2019,engine:'1.5 dCi'},
 {brand:'Renault',model:'Megane',yearFrom:2020,yearTo:2022,engine:'1.3 TCe'},
 {brand:'Volkswagen',model:'Golf',yearFrom:2018,yearTo:2021,engine:'1.6 TDI'},
 {brand:'Renault',model:'Clio',yearFrom:2020,yearTo:2022,engine:''},
]);
test('catalog facets deduplicate brands and restrict models, years and engines to their parents',()=>{
 const r=plain(call('vehicleFilterOptions',catalog,{...blank,brand:'renault',model:'Clio',year:'2021'}));
 assert.deepEqual(r,{brand:['Renault','Volkswagen'],model:['Clio','Megane'],year:['2022','2021','2020','2019','2018','2017'],engine:['1.0 TCe']});
 const allYears=plain(call('vehicleFilterOptions',catalog,{...blank,brand:'Renault',model:'Clio'}));
 assert.deepEqual(allYears.engine,['1.0 TCe','1.5 dCi']);
 assert.deepEqual(plain(call('vehicleFilterOptions',catalog,blank)).model,[]);
});
test('changing a parent cannot leave stale model year or engine selections',()=>{
 const current={brand:'Renault',model:'Clio',year:'2021',engine:'1.0 TCe'};
 assert.deepEqual(plain(call('selectVehicleFilter',current,'brand','Volkswagen')),{brand:'Volkswagen',model:'',year:'',engine:''});
 assert.deepEqual(plain(call('selectVehicleFilter',current,'model','Megane')),{...current,model:'Megane',year:'',engine:''});
 assert.deepEqual(plain(call('selectVehicleFilter',current,'year','2019')),{...current,year:'2019',engine:''});
 assert.deepEqual(plain(call('selectVehicleFilter',current,'brand','')),blank);
 assert.equal(call('selectVehicleFilter',current,'brand','Renault'),current);
});
test('saved vehicle stays selectable even when no active listing contains it',()=>{
 const selection={brand:'Ford',model:'Focus',year:'2008',engine:'1.6'};
 const r=plain(call('vehicleFilterOptions',catalog,selection,selection));
 assert.ok(r.brand.includes('Ford'));assert.deepEqual(r.model,['Focus']);assert.deepEqual(r.year,['2008']);assert.deepEqual(r.engine,['1.6']);
});
test('malformed ranges never expand into huge or impossible year lists',()=>{
 const rows=call('normalizeVehicleFitments',[null,'wrong',{brand:'Renault',model:'Clio',yearFrom:1,yearTo:99999999,engine:'Unknown'}, {brand:'Renault',model:'Clio',yearFrom:2022,yearTo:2020}, {brand:42,model:'Clio'}]);
 const r=plain(call('vehicleFilterOptions',rows,{...blank,brand:'Renault',model:'Clio',year:'2021'}));
 assert.deepEqual(r.year,[]);assert.deepEqual(r.engine,[]);
 assert.deepEqual(plain(call('normalizeVehicleFitments',{})),[]);
});
test('vehicle choices load from all active catalog pages, independently of the result search',async()=>{
 const calls=[];
 const pages=[Array.from({length:500},()=>({compatible_vehicles:[{brand:'A',model:'A1'}]})),[{compatible_vehicles:[{brand:'B',model:'B1'}]}]];
 const client={from(table){calls.push(['from',table]);const q={select(...a){calls.push(['select',...a]);return q},eq(...a){calls.push(['eq',...a]);return q},order(...a){calls.push(['order',...a]);return q},range(a,b){calls.push(['range',a,b]);return Promise.resolve({data:pages[a/500],error:null})}};return q;}};
 const rows=await call('loadMarketplaceVehicleFitments',client);
 assert.equal(rows.length,501);assert.equal(rows.at(-1).brand,'B');
 assert.deepEqual(calls.filter(c=>c[0]==='range'),[['range',0,499],['range',500,999]]);
 assert.equal(calls.filter(c=>c[0]==='eq'&&c[1]==='is_active'&&c[2]===true).length,2);
});
test('catalog errors are reported instead of showing an empty successful list',async()=>{
 const q={select(){return q},eq(){return q},order(){return q},range:async()=>({data:null,error:new Error('offline')})};
 await assert.rejects(call('loadMarketplaceVehicleFitments',{from:()=>q}),/offline/);
});
