const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
const source = stripTypeScriptTypes(fs.readFileSync('lib/vehicleConsumption.ts', 'utf8')).replace(/export /g, '');
const calls = []; let response = { data: [], error: null }; let authError = null; let user = {id:'owner-a'};
const query = new Proxy({}, {get(_t, key) {
 if (key === 'then') return resolve => resolve(response);
 return (...args) => { calls.push([key, ...args]); return query; };
}});
const client = {auth:{getUser:async()=>({data:{user},error:authError})}, from:table=>{calls.push(['from',table]);return query;}};
const ctx = vm.createContext({ Date, Number, Set, client }); vm.runInContext(source,ctx);
const run=(code,input)=>{ctx.input=input;return vm.runInContext(code,ctx);};
const vehicle={brand:'Renault',model:'Clio',year:'2025',fuelType:'Benzin'};
test('catalog options use exact model fuel year and escape wildcard text',async()=>{
 calls.length=0;response={data:[{engine:'1.0 TCe manual',consumption_per_100:5.6,source:'reference'}],error:null};
 const r=await run('listConsumptionOptions(client,input)',{...vehicle,model:'Clio_100%'});
 assert.equal(r[0].value,5.6);
 for (const [method,col,value] of [['ilike','model','Clio\\_100\\%'],['eq','fuel_type','benzin'],['lte','year_from',2025],['gte','year_to',2025]]) assert.ok(calls.some(c=>c[0]===method&&c[1]===col&&c[2]===value));
});
test('incomplete or unrecognized fuel never requests arbitrary catalog records',async()=>{
 for(const overrides of [{year:''},{fuelType:''},{fuelType:'unknown'},{brand:' '},{model:''},{year:'9999'}]) {
 calls.length=0;assert.equal((await run('listConsumptionOptions(client,input)',{...vehicle,...overrides})).length,0);assert.equal(calls.length,0);
 }
});
test('invalid references and duplicate engine variants are excluded',async()=>{
 response={data:[{engine:'A',consumption_per_100:5},{engine:'a',consumption_per_100:8},{engine:'B',consumption_per_100:100},{engine:null,consumption_per_100:6}],error:null};
 const r=await run('listConsumptionOptions(client,input)',vehicle);assert.equal(r.length,1);assert.equal(r[0].value,5);
});
test('catalog failure is reported instead of claiming no records',async()=>{
 response={data:null,error:new Error('offline')};await assert.rejects(run('listConsumptionOptions(client,input)',vehicle),/offline/);
});
test('custom consumption saves for the current account and confirms returned value',async()=>{
 calls.length=0;response={data:{vehicle_id:'car-a',custom_consumption_per_100:6.25},error:null};
 assert.equal(await run("saveConsumptionPreference(client,'car-a',input)",'6,25'),6.25);
 assert.equal(calls.find(c=>c[0]==='upsert')[1].user_id,'owner-a');
 response={data:{vehicle_id:'another-car',custom_consumption_per_100:6.25},error:null};
 await assert.rejects(run("saveConsumptionPreference(client,'car-a',input)",'6,25'),/doğrulanamadı/);
});
test('reset deletes only this owner and vehicle and verifies no preference remains',async()=>{
 calls.length=0;response={data:null,error:null};
 assert.equal(await run("saveConsumptionPreference(client,'car-a',input)",''),null);
 assert.ok(calls.some(c=>c[0]==='delete'));
 assert.equal(calls.filter(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='owner-a').length,2);
 assert.equal(calls.filter(c=>c[0]==='eq'&&c[1]==='vehicle_id'&&c[2]==='car-a').length,2);
 response={data:{vehicle_id:'car-a'},error:null};
 await assert.rejects(run("saveConsumptionPreference(client,'car-a',input)",''),/sıfırlanamadı/);
});
test('invalid custom amounts are rejected before any writes',async()=>{
 for(const value of ['NaN','Infinity','1e1','0','51','-1','6.125','6,3x']){
 calls.length=0;await assert.rejects(run("saveConsumptionPreference(client,'car-a',input)",value));assert.equal(calls.length,0);
 }
});
test('signed-out and failed auth cannot update preferences',async()=>{
 user=null;calls.length=0;await assert.rejects(run("saveConsumptionPreference(client,'car-a',input)",'6'),/Oturum/);assert.equal(calls.length,0);
 user={id:'owner-a'};authError=new Error('expired');await assert.rejects(run("saveConsumptionPreference(client,'car-a',input)",'6'),/expired/);authError=null;
});
test('vehicle year boundaries and supported fuel choices are checked',()=>{
 assert.equal(Object.keys(run('validateVehicleBasics(input)',vehicle)).length,0);
 for(const year of ['1899','9999','2e3'])assert.ok(run('validateVehicleBasics(input)',{...vehicle,year}).year);
 assert.ok(run('validateVehicleBasics(input)',{...vehicle,fuelType:'Other'}).fuelType);
});
test('invalid mileages and impossible or future service dates are rejected without stripping signs',()=>{
 for(const mileage of ['-1','1.5','abc','1e4','10000001',''])assert.ok(run('validateVehicleUsage(input, "")',mileage).mileage);
 for(const date of ['31.02.2024','29.02.2023','99.12.2020','01.01.2999'])assert.ok(run('validateVehicleUsage("1",input)',date).lastServiceDate);
 assert.equal(Object.keys(run('validateVehicleUsage("0",input)','29.02.2024')).length,0);
});
