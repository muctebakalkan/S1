const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const {stripTypeScriptTypes}=require('node:module');
function setup({error=null,authError=null,user={id:'owner'},data=[]}={}){
 const calls=[];const q=new Proxy({}, {get(_t,key){if(key==='then')return resolve=>resolve({data,error});return (...args)=>{calls.push([key,...args]);return q;};}});
 const ctx=vm.createContext({supabase:{auth:{getUser:async()=>({data:{user},error:authError})},from:table=>{calls.push(['from',table]);return q;}},VEHICLE_BRANDS:[{id:'renault',name:'Renault'},{id:'bmw',name:'BMW'}]});
 const src=stripTypeScriptTypes(fs.readFileSync('lib/community.ts','utf8')).replace(/^import .*;$/gm,'').replace(/export /g,'');vm.runInContext(src,ctx);
 return {calls,run:s=>vm.runInContext(s,ctx)};
}
test('brand group and category filters are combined on the server',async()=>{const t=setup();await t.run("listForumPosts('Soru','','renault')");assert.ok(t.calls.some(c=>c[0]==='eq'&&c[1]==='brand_group'&&c[2]==='renault'));assert.ok(t.calls.some(c=>c[0]==='eq'&&c[1]==='category'&&c[2]==='Soru'));});
test('old posts remain in general without inferred vehicle brands',async()=>{const t=setup();await t.run("listForumPosts('Tümü','','general')");assert.ok(t.calls.some(c=>c[0]==='is'&&c[1]==='brand_group'&&c[2]===null));});
test('failed reads reject instead of returning fictional forum activity',async()=>{const t=setup({error:new Error('offline')});await assert.rejects(t.run('listForumPosts()'),/offline/);});
test('failed publication is never reported as a locally successful public post',async()=>{const t=setup({error:new Error('offline')});await assert.rejects(t.run("createForumPost({title:'Test title',body:'A detailed test question',category:'Soru',brandGroup:'renault'})"),/offline/);});
test('signed-out visitors cannot publish comments',async()=>{const t=setup({user:null});await assert.rejects(t.run("addForumComment('post','My answer')"),/giriş/);assert.equal(t.calls.length,0);});
test('invalid groups and empty comments are rejected before any write',async()=>{const t=setup();await assert.rejects(t.run("createForumPost({title:'Test title',body:'A detailed test question',category:'Soru',brandGroup:'invalid'})"),/grubu/);await assert.rejects(t.run("addForumComment('post','  ')"),/karakter/);assert.equal(t.calls.length,0);});
test('forum uses the privacy-safe author view and bounded pages',async()=>{const t=setup();await t.run("listForumPosts('Tümü','','all',2)");assert.ok(t.calls.some(c=>c[0]==='select'&&c[1].includes('profile_directory!user_id')));assert.ok(t.calls.some(c=>c[0]==='range'&&c[1]===60&&c[2]===89));});
test('filter syntax in search cannot inject an extra query condition',async()=>{const t=setup();await t.run("listForumPosts('Tümü','a%,id.eq.secret')");const filter=t.calls.find(c=>c[0]==='or')[1];assert.equal(filter.split(',').length,2);assert.ok(!filter.includes('id.eq'));});
test('like lookup failure cannot turn into a fabricated successful like',async()=>{const t=setup({error:new Error('offline')});await assert.rejects(t.run("toggleForumLike({id:'post',likes_count:3})"),/offline/);assert.equal(t.calls.some(c=>c[0]==='insert'),false);});
test('signed-out forum reads request login without querying the private author view',async()=>{
 for(const expr of ['listForumPosts()',"getForumPost('post')","listForumComments('post')"]){
  const t=setup({user:null});await assert.rejects(t.run(expr),e=>e.name==='ForumAuthRequiredError' && /giriş/.test(e.message));assert.equal(t.calls.length,0);
 }
});
test('Supabase missing-session errors are distinguished from a network failure',async()=>{
 const missing=setup({user:null,authError:{name:'AuthSessionMissingError',message:'Auth session missing!'}});
 await assert.rejects(missing.run('listForumPosts()'),e=>e.name==='ForumAuthRequiredError');
 const offline=setup({user:null,authError:Error('network unavailable')});await assert.rejects(offline.run('listForumPosts()'),/network unavailable/);
});
