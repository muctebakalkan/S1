const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function analyze(response) {
 const ctx = vm.createContext({ supabase: { functions: { invoke: async () => response } } });
 vm.runInContext(stripTypeScriptTypes(fs.readFileSync('lib/aiDamageAnalysis.ts', 'utf8')).replace(/^import .*;$/gm, '').replace(/export /g, ''), ctx);
 return vm.runInContext("analyzeDamage(null, 'Fren pedalı sertleşiyor')", ctx);
}
test('an unavailable analysis service never fabricates body damage or urgency', async () => {
 const result = await analyze({ error: Error('offline') });
 assert.equal(result.damageType, 'Otomatik analiz alınamadı');
 assert.equal(result.urgencyLevel, null);
});
test('malformed analysis responses fall back to an explicit unavailable result', async () => {
 for (const result of ['invalid', {}, { damageType: 'Fren', possibleAction: '' }]) {
   assert.equal((await analyze({ data: { result } })).damageType, 'Otomatik analiz alınamadı');
 }
});
test('valid analysis preserves findings without inventing missing urgency', async () => {
 const result = { damageType: 'Fren sistemi', possibleAction: 'Usta kontrolü', urgencyLevel: 'high' };
 assert.equal((await analyze({ data: { result } })).urgencyLevel, 'Yüksek');
 assert.equal((await analyze({ data: { result: { ...result, urgencyLevel: undefined } } })).urgencyLevel, null);
});
