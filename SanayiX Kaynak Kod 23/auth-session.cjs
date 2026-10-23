const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function setup() {
  const accounts = new Map(), routes = [], calls = [];
  let current = null;
  const state = { logoutError: null, profileError: null };
  const supabase = {
    auth: {
      async signUp({email,password,options}) {
        const user = {id:email,email,user_metadata:options.data};
        accounts.set(email,{user,password,role:options.data.registration_role});
        current = user;
        return {data:{user,session:{user}},error:null};
      },
      async signInWithPassword({email,password}) {
        calls.push({email,password});
        const a = accounts.get(email);
        if (!a || a.password !== password) return {data:{},error:{code:'invalid_credentials'}};
        current = a.user;
        return {data:{user:current,session:{user:current}},error:null};
      },
      async getUser() { return {data:{user:current},error:null}; },
      async signOut(options) {
        assert.equal(options.scope,'local');
        if (!state.logoutError) current = null;
        return {error:state.logoutError};
      },
    },
    from(table) {
      let id;
      const query = {
        select() { return query; }, eq(key,value) { id=value; return query; }, limit() { return query; },
        async single() { return {data:{role:accounts.get(id)?.role},error:state.profileError}; },
        async maybeSingle() { return {data:table==='vehicles'?{id:'vehicle'}:null,error:null}; },
      };
      return query;
    },
  };
  const source = stripTypeScriptTypes(fs.readFileSync('lib/auth.ts','utf8'))
    .replace(/^import .*;$/gm,'').replace(/export /g,'');
  const context = vm.createContext({supabase,router:{replace:r=>routes.push(r)},
    WebBrowser:{maybeCompleteAuthSession(){}}, AUTH_REDIRECT_URI:'sanayix://auth/callback',
    Crypto:{randomUUID:()=> '11111111-1111-4111-8111-111111111111'},
    validateAuthEmail:e=>e.trim().toLowerCase(),validateAccountRegistration(){},
    completePendingSellerRegistration:async()=>{},completePendingAccountRegistration:async()=>{},
  });
  vm.runInContext(source,context);
  return {run:s=>vm.runInContext(s,context),routes,calls,state,get current(){return current;}};
}
for (const [role,register,extra,route] of [
  ['customer','registerUser',"vehicleBrand:'Fiat',vehicleModel:'Egea',vehicleYear:'2020'",'/user/home'],
  ['mechanic','registerMechanic',"address:'Test',city:'Ankara',specialty:'Motor'",'/mechanic/home'],
]) test(`${role}: register, logout, login, logout, login preserves credentials and role`,async()=>{
  const t=setup();
  await t.run(`${register}({email:' Reviewer@example.test ', password:' Pass.123 ', fullName:'Reviewer',${extra}})`);
  for(let i=0;i<2;i++) {
    await t.run('signOut()'); assert.equal(t.current,null);
    await t.run("signInAndNavigate(' REVIEWER@example.test ', ' Pass.123 ')");
    assert.equal(t.routes.at(-1),route);
    assert.equal(t.calls.at(-1).password,' Pass.123 ');
  }
});
test('wrong password does not navigate or hide Auth error',async()=>{
  const t=setup(); await assert.rejects(t.run("signInAndNavigate('reviewer@example.test','wrong')"),e=>e.code==='invalid_credentials');
  assert.equal(t.routes.length,0);
});
test('failed logout propagates error and retains session',async()=>{
  const t=setup(); await t.run("registerMechanic({email:'reviewer@example.test',password:'Pass.123',fullName:'Test',address:'Test',city:'Ankara',specialty:'Motor'})");
  t.state.logoutError = new Error('offline');
  await assert.rejects(t.run('signOut()'),/offline/); assert.ok(t.current);
});
test('profile failure after Auth success cannot navigate to the wrong role',async()=>{
  const t=setup(); await t.run("registerMechanic({email:'reviewer@example.test',password:'Pass.123',fullName:'Test',address:'Test',city:'Ankara',specialty:'Motor'})");
  t.state.profileError = new Error('profile unavailable');
  await assert.rejects(t.run("signInAndNavigate('reviewer@example.test','Pass.123')"),/profile unavailable/);
  assert.equal(t.routes.length,0);
});
test('signed-in listener defers Auth-dependent work until callback returns',()=>{
  const s=fs.readFileSync('app/_layout.tsx','utf8');
  const callback=s.match(/onAuthStateChange\(\(event, session\) => \{([\s\S]*?)\n    \}\);/)[1];
  const queued=[]; let locked=true, registered=0;
  const ctx=vm.createContext({event:'SIGNED_IN',session:{user:{}},mounted:true,console,
    setTimeout:fn=>queued.push(fn),registerDeviceToken:()=>{assert.equal(locked,false);registered++;return Promise.resolve();}});
  vm.runInContext(callback,ctx); assert.equal(registered,0);
  locked=false; queued.forEach(fn=>fn()); assert.equal(registered,1);
});
