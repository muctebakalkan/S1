const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync('lib/fuelLedger.ts','utf8')).replace(/^import .*;$/gm,'').replace(/export /g,'');
function setup(options={}) {
 const state={user:'owner',remote:[],error:null,local:[],...options},calls=[];
 const q=new Proxy({}, {get(_t,key){if(key==='then')return resolve=>resolve({data:state.remote,error:state.error});return(...args)=>{calls.push([key,...args]);return q;};}});
 const ctx=vm.createContext({Date,Number,JSON,AsyncStorage:{getItem:async()=>JSON.stringify(state.local),setItem:async()=>{throw Error('Unexpected local write');}},supabase:{auth:{getUser:async()=>({data:{user:state.user?{id:state.user}:null},error:null})},from:()=>q}});
 vm.runInContext(source,ctx);return {state,calls,run:expr=>vm.runInContext(expr,ctx)};
}
test('legacy offline fuel records are visible only to their recorded owner',async()=>{
 const t=setup({local:[{id:'a',user_id:'owner',filled_at:'2026-09-12'},{id:'b',user_id:'other'},{id:'c',user_id:null}]});
 const rows=await t.run('listFuelEntries()');assert.equal(rows.length,1);assert.equal(rows[0].id,'a');assert.equal(rows[0].is_local,true);
});
test('signed-out fuel reads cannot expose the shared legacy device cache',async()=>{
 const t=setup({user:null,local:[{id:'a',user_id:'owner'}]});await assert.rejects(t.run('listFuelEntries()'),/giriş/);assert.equal(t.calls.length,0);
});
test('failed fuel reads surface a connection error rather than a false empty ledger',async()=>{
 const t=setup({error:Error('offline')});await assert.rejects(t.run('listFuelEntries()'),/offline/);
});
test('failed server writes never return a fabricated successful local fuel entry',async()=>{
 const t=setup({error:Error('offline')});await assert.rejects(t.run('addFuelEntry({liters:40,amount:2400})'),/offline/);
});
test('signed-out writes cannot create unowned device fuel entries',async()=>{
 const t=setup({user:null});await assert.rejects(t.run('addFuelEntry({liters:40,amount:2400})'),/giriş/);
});
test('nonfinite or negative fuel values are rejected before writes',async()=>{
 for(const input of ['{liters:Infinity,amount:1}','{liters:1,amount:NaN}','{liters:1,amount:1,odometerKm:-1}']){
  const t=setup();await assert.rejects(t.run(`addFuelEntry(${input})`),/kontrol/);assert.equal(t.calls.length,0);
 }
});
test('odometer readings from different cars cannot be treated as one journey',()=>{
 const t=setup();const stats=t.run("calculateFuelStats([{vehicle_id:'a',liters:40,amount:10,odometer_km:1000,filled_at:'2026-09-01'},{vehicle_id:'b',liters:40,amount:10,odometer_km:1500,filled_at:'2026-09-02'}])");
 assert.equal(stats.averageConsumption,null);
});
test('backwards mileage does not become a made-up positive consumption estimate',()=>{
 const t=setup();const stats=t.run("calculateFuelStats([{vehicle_id:'a',liters:40,amount:10,odometer_km:1500,filled_at:'2026-09-01'},{vehicle_id:'a',liters:40,amount:10,odometer_km:1000,filled_at:'2026-09-02'}])");
 assert.equal(stats.averageConsumption,null);
});
