import fs from 'node:fs';
import vm from 'node:vm';

const sandbox = { console };
sandbox.window = sandbox;
sandbox.GSP = {};
vm.runInNewContext(fs.readFileSync(new URL('../js/application/services/attendance-notification-service.js', import.meta.url), 'utf8'), sandbox);

const messages = [];
const logs = [];
const service = sandbox.GSP.createAttendanceNotificationService({
  alert: message => messages.push(message),
  showConfirm: async message => { messages.push('confirm:' + message); return true; },
  logger: { warn: (...args) => logs.push(['warn', ...args]), error: (...args) => logs.push(['error', ...args]) }
});

service.warning('تحذير');
service.success('نجاح');
const confirmed = await service.confirm('تأكيد');
service.reportWarning('ctx', new Error('x'));
service.reportError('ctx2', new Error('y'), 'فشل');

if (messages.join('|') !== 'تحذير|نجاح|confirm:تأكيد|فشل') throw new Error('notification messages were not delegated correctly');
if (!confirmed) throw new Error('confirm did not delegate');
if (logs.length !== 2 || logs[0][0] !== 'warn' || logs[1][0] !== 'error') throw new Error('diagnostics were not routed correctly');
console.log('attendance notification tests passed');
