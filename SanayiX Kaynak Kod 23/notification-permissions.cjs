const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function source(path){return stripTypeScriptTypes(fs.readFileSync(path,'utf8')).replace(/^import .*;$/gm,'').replace(/export /g,'');}
function setup(options={}) {
  const state={os:'android',granted:false,canAskAgain:true,...options}, calls=[], notices=[];
  const N={
    AndroidImportance:{DEFAULT:3},SchedulableTriggerInputTypes:{DATE:'date'},
    setNotificationChannelAsync:async()=>{calls.push('channel');if(state.channelFails)throw Error('channel failed');},
    setNotificationHandler:handler=>{calls.push('handler');state.handler=handler;},
    getPermissionsAsync:async()=>{calls.push('permission');return {granted:state.granted,canAskAgain:state.canAskAgain};},
    requestPermissionsAsync:async()=>{calls.push('prompt');return {granted:!state.denied};},
    getExpoPushTokenAsync:async()=>{calls.push('push');throw Error('no remote push credentials');},
    scheduleNotificationAsync:async args=>{if(state.scheduleFails)throw Error('OS failure');notices.push(args);return 'test';},
  };
  const ctx=vm.createContext({Platform:{OS:state.os},Constants:{},savePushToken:async()=>{},Date,require:()=>N});
  vm.runInContext(source('lib/notificationSetup.ts')+'\n'+source('lib/driving/notifications.ts'),ctx);
  return {state,calls,notices,run:expr=>vm.runInContext(expr,ctx)};
}
test('Android channel is created before the first permission prompt',async()=>{
 const t=setup();assert.equal(await t.run('registerForPush()'),true);
 assert.ok(t.calls.indexOf('channel')<t.calls.indexOf('prompt'));
 assert.equal((await t.state.handler.handleNotification()).shouldShowBanner,true);
});
test('remote push failure does not disable local phone notifications',async()=>{
 const t=setup({granted:true});assert.equal(await t.run('registerForPush()'),true);
 await t.run('scheduleNotificationTest()');assert.equal(t.notices.length,1);
 assert.equal(t.notices[0].trigger.channelId,'default');
 assert.ok(t.notices[0].trigger.date.getTime()>Date.now());
});
test('denied permission never schedules a test or reports registration success',async()=>{
 const t=setup({denied:true});assert.equal(await t.run('registerForPush()'),false);
 await assert.rejects(t.run('scheduleNotificationTest()'),/izin verin/);assert.equal(t.notices.length,0);
});
test('permanently denied test permission directs to settings without another prompt',async()=>{
 const t=setup({canAskAgain:false});await assert.rejects(t.run('scheduleNotificationTest()'),/ayarlarından/);
 assert.equal(t.calls.includes('prompt'),false);
});
test('iOS local notifications do not call an Android channel API',async()=>{
 const t=setup({os:'ios',granted:true});await t.run('scheduleNotificationTest()');
 assert.equal(t.calls.includes('channel'),false);assert.equal(t.notices.length,1);
});
test('OS scheduling and Android setup errors stay visible to the test button',async()=>{
 for(const options of [{scheduleFails:true},{channelFails:true}]) {
  const t=setup({granted:true,...options});await assert.rejects(t.run('scheduleNotificationTest()'));assert.equal(t.notices.length,0);
 }
});
