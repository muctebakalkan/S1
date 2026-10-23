const path = require('node:path');
const installed = Symbol.for('sanayix.expo54FileEvents');

// Expo 54 listens for eventsQueue; Metro 0.83.8's security-fixed file map emits
// changes instead. Keep the new event intact for Metro and add the legacy view
// for Expo's TypeScript/config watchers. Remove when upgrading Expo's watcher API.
function legacyEvents(event) {
  if (event.eventsQueue || !event.changes) return event;
  const eventsQueue = [];
  for (const [kind, type] of [['addedFiles', 'add'], ['modifiedFiles', 'change'], ['removedFiles', 'delete']]) {
    for (const [filePath, metadata] of event.changes[kind]) {
      eventsQueue.push({ type, filePath: path.resolve(event.rootDir, filePath), metadata: { modifiedTime: metadata?.modifiedTime, type: metadata?.isSymlink ? 'l' : 'f' } });
    }
  }
  return { ...event, eventsQueue };
}
function install() {
  if (!require('expo/package.json').version.startsWith('54.')) return;
  const FileMap = require('metro-file-map').default;
  if (FileMap.prototype[installed]) return;
  const emit = FileMap.prototype.emit;
  FileMap.prototype.emit = function (name, event, ...rest) {
    return emit.call(this, name, name === 'change' && event ? legacyEvents(event) : event, ...rest);
  };
  Object.defineProperty(FileMap.prototype, installed, { value: true });
}
module.exports = { install, legacyEvents };
