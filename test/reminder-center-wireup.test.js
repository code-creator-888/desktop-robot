const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererPath = path.join(__dirname, '..', 'renderer.js');
const preloadPath = path.join(__dirname, '..', 'preload.js');
const mainPath = path.join(__dirname, '..', 'main.js');

test('renderer supports reminder center opening and periodic checks', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /function openReminderCenter\(\)/);
  assert.match(source, /function closeReminderCenter\(\)/);
  assert.match(source, /function checkDueReminders\(\)/);
  assert.match(source, /setInterval\(checkDueReminders,\s*30000\)/);
  assert.match(source, /action === 'reminder-center'/);
  assert.match(source, /showSpeech\(`提醒：\$\{item\.title\}`,\s*0,\s*true\)/);
  assert.match(source, /speechBubble\.addEventListener\('click'/);
  assert.doesNotMatch(source, /reminderImportCalendarBtn/);
  assert.doesNotMatch(source, /getCalendarEvents/);
});

test('renderer supports deleting reminders from list', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /class="reminder-delete-btn"/);
  assert.match(source, /querySelectorAll\('\.reminder-delete-btn'\)/);
  assert.match(source, /reminderItems\s*=\s*reminderItems\.filter\(x => x\.id !== id\)/);
});

test('renderer supports rule-based reminder scheduling', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
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
  assert.match(source, /onPetClick\(\(\)\s*=>\s*\{[\s\S]*if\s*\(!snoozeBar\.classList\.contains\('hidden'\)\)\s*return;/);
});

test('renderer keeps current alert item for snooze confirm and reactivates reminder', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
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
  assert.doesNotMatch(source, /ipcMain\.handle\('get-calendar-events'/);
});
