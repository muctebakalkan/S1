const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
function setup(){
 const scripts=[],timers=new Set(),window=new EventTarget();
 const document={createElement:()=>({remove(){this.removed=true;}}),head:{appendChild:script=>scripts.push(script)}};
 const c=vm.createContext({window,document,Promise,Error,setTimeout:fn=>{timers.add(fn);return fn;},clearTimeout:fn=>timers.delete(fn)});
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('lib/mapLibreWeb.ts','utf8')).replace(/^import .*;$/gm,'').replace(/export /g,''),c);
 return {window,scripts,timers,load:()=>vm.runInContext('loadMapLibreWeb()',c),ready:api=>{window.sanayixMapLibre=api;window.dispatchEvent(new CustomEvent('sanayix-maplibre-ready',{detail:api}));}};
}
test('concurrent maps share one library request and release load listeners/timers',async()=>{
 const s=setup(),first=s.load(),second=s.load();assert.equal(s.scripts.length,1);
 const api={Map:class{}};s.ready(api);assert.equal(await first,api);assert.equal(await second,api);assert.equal(s.timers.size,0);assert.equal(s.scripts[0].removed,true);
 assert.equal(await s.load(),api);assert.equal(s.scripts.length,1);
});
test('a late module success after timeout is reusable without waiting for an event that already fired',async()=>{
 const s=setup(),failed=s.load();for(const timer of [...s.timers])timer();await assert.rejects(failed,/yüklenemedi/);
 const api={Map:class{}};s.ready(api);assert.equal(await s.load(),api);assert.equal(s.scripts.length,1);
});
test('a script error is retryable and uses a fresh loader URL',async()=>{
 const s=setup(),failed=s.load();s.scripts[0].onerror();await assert.rejects(failed,/yüklenemedi/);
 const retried=s.load();assert.equal(s.scripts.length,2);assert.notEqual(s.scripts[0].src,s.scripts[1].src);
 const api={Map:class{}};s.ready(api);assert.equal(await retried,api);assert.equal(s.timers.size,0);
});
