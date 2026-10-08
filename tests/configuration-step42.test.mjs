import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../js/application/services/configuration-service.js', import.meta.url), 'utf8');
let store = {};
const context = {
  console,
  localStorage: {
    getItem: key => Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null,
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: key => { delete store[key]; }
  },
  location: { hostname: 'localhost' },
  GSP_RUNTIME_CONFIG: {}
};
context.window = context;
vm.runInNewContext(source, context, { filename: 'configuration-service.js' });
const api = context.GSP.configuration;
let passed = 0;
function assert(cond, msg) { if (!cond) throw new Error(msg); passed++; }

assert(api.get('appName') === 'Grade System Pro', 'default app name');
assert(api.get('environment') === 'development', 'environment detection');
assert(api.get('direction') === 'rtl', 'default direction');
assert(api.isCloudConfigured() === true, 'cloud configuration should be valid');
assert(api.validate({ direction: 'bad' }).ok === false, 'invalid direction rejected');
assert(api.setLocal('ui', { compactTables: true, rememberFilters: false }).ok === true, 'local UI settings persist');
assert(api.get('ui').compactTables === true, 'local UI setting applied');
assert(api.setLocal('supabaseUrl', 'https://evil.example').ok === false, 'runtime-only key cannot be locally changed');
assert(api.setLocal('locale', 'en-US').ok === true, 'locale can be changed locally');
assert(api.get('locale') === 'en-US', 'locale override applied');
assert(api.setLocal('direction', 'bad').ok === false, 'invalid local direction rejected');
assert(api.resetLocal().ok === true, 'local configuration reset');
assert(api.get('locale') === 'ar-EG', 'reset restores locale');
assert(api.get('ui').compactTables === false, 'reset restores UI defaults');
assert(Object.isFrozen(api), 'configuration API frozen');
console.log(`STEP 42 configuration management: ${passed}/${passed} PASS`);
