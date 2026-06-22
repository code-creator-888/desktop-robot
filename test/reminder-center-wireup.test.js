const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'renderer.js');
const reminderModulePath = path.join(__dirname, '..', 'renderer-reminder.js');
const preloadPath = path.join(__dirname, '..', 'preload.js');
const mainPath = path.join(__dirname, '..', 'main.js');

test('renderer supports reminder center opening and periodic checks', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  const reminderModule = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(reminderModule, /function openReminderCenter\(\)/);
  assert.match(reminderModule, /function closeReminderCenter\(\)/);
  assert.match(reminderModule, /function checkDueReminders\(\)/);
  assert.match(reminderModule, /setInterval\(checkDueReminders,\s*30000\)/);
  assert.match(source, /action === 'reminder-center'/);
  assert.match(reminderModule, /showSpeech\(`提醒：\$\{item\.title\}`,\s*0,\s*true\)/);
  assert.match(reminderModule, /speechBubble\.addEventListener\('click'/);
  assert.match(source, /reminderController\.bindReminderEvents/);
  assert.doesNotMatch(source, /reminderImportCalendarBtn/);
  assert.doesNotMatch(source, /getCalendarEvents/);
});

test('renderer supports deleting reminders from list', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /'reminder-delete-btn'/);
  assert.match(source, /querySelectorAll\('\.reminder-delete-btn'\)/);
  assert.match(source, /reminderItems\s*=\s*reminderItems\.filter\(x => x\.id !== id\)/);
});

test('renderer supports rule-based reminder scheduling', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /function computeNextTriggerAt\(/);
  assert.match(source, /rule:\s*\{/);
  assert.match(source, /'one-time'/);
  assert.match(source, /nextTriggerAt:/);
  assert.match(source, /item\.nextTriggerAt/);
});

test('renderer has no snooze controls or snooze rule data', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.doesNotMatch(source, /snoozeOptions:\s*\[5,\s*10,\s*30\]/);
  assert.doesNotMatch(source, /reminder-snooze-select/);
  assert.doesNotMatch(source, /reminder-snooze-btn/);
});

test('renderer ignores pet click when snooze bar is visible', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /onRobotClick\(\(\)\s*=>\s*\{[\s\S]*if\s*\(!snoozeBar\.classList\.contains\('hidden'\)\)\s*return;/);
});

test('renderer keeps current alert item for snooze confirm and reactivates reminder', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /showSpeech\(`提醒：\$\{item\.title\}`,\s*0,\s*true\);\s*currentAlertItem = item;/);
  assert.match(source, /currentAlertItem\.status\s*=\s*'pending';/);
});

test('preload exposes calendar fetch for reminder import', () => {
  const source = fs.readFileSync(preloadPath, 'utf8');
  assert.doesNotMatch(source, /getCalendarEvents:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-calendar-events'\)/);
});

test('main process includes reminder menu and calendar IPC', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /提醒中心/);
  assert.match(source, /测试空闲动作/);
  assert.match(source, /test-idle-yawn/);
  assert.match(source, /test-idle-stretch/);
  assert.match(source, /test-idle-rub-eyes/);
  assert.doesNotMatch(source, /ipcMain\.handle\('get-calendar-events'/);
});
