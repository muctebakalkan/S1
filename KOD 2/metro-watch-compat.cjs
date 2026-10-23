const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { legacyEvents, install } = require('../scripts/metro-expo54-compat.cjs');
const cliRoot = path.dirname(require.resolve('@expo/cli/package.json'));
const { observeFileChanges, waitForMetroToObserveTypeScriptFile } = require(path.join(cliRoot,'build/src/start/server/metro/waitForMetroToObserveTypeScriptFile.js'));
const changes = {addedFiles:[['app/new-screen.tsx',{isSymlink:false}]],modifiedFiles:[['tsconfig.json',{isSymlink:false}]],removedFiles:[['old.ts',{isSymlink:false}]]};
test('actual Expo54 TS/config watchers accept the security-fixed Metro event',()=>{
 const watcher=new EventEmitter(),server=new EventEmitter();
 const runner={server,metro:{getBundler:()=>({getBundler:()=>({getWatcher:()=>watcher})})}};
 let added=0,config=0;
 waitForMetroToObserveTypeScriptFile('/app',runner,()=>added++);
 observeFileChanges(runner,['/app/tsconfig.json'],()=>config++);
 const event={rootDir:'/app',changes,logger:null};
 watcher.emit('change',legacyEvents(event));
 assert.equal(added,1);assert.equal(config,1);
 assert.equal(legacyEvents(event).changes,changes);
 server.emit('close');assert.equal(watcher.listenerCount('change'),0);
});
test('adapter installation is idempotent and leaves other events intact',()=>{
 install();const FileMap=require('metro-file-map').default, first=FileMap.prototype.emit;install();assert.equal(FileMap.prototype.emit,first);
 const watcher=new EventEmitter();watcher.emit=FileMap.prototype.emit;
 let received;watcher.on('change',e=>received=e);
 watcher.emit('change',{rootDir:'/app',changes});assert.equal(received.eventsQueue.length,3);assert.equal(received.changes,changes);
 const data={any:'data'};watcher.on('status',value=>received=value);watcher.emit('status',data);assert.equal(received,data);
 const old={eventsQueue:[]};assert.equal(legacyEvents(old),old);
});
