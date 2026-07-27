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
  assert.match(reminderModule, /showSpeech\(`提醒：\$\{item\.title\}`,\s*0,\s*true,\s*'reminder-alert'\)/);
  assert.match(reminderModule, /function queueReminderAlert\(item\)/);
  assert.match(reminderModule, /function showNextQueuedAlert\(\)/);
  assert.match(reminderModule, /speechBubble\.addEventListener\('click'/);
  assert.match(source, /reminderController\.bindReminderEvents/);
  assert.doesNotMatch(source, /reminderImportCalendarBtn/);
  assert.doesNotMatch(source, /getCalendarEvents/);
});

test('renderer supports deleting reminders from list', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /'reminder-delete-btn'/);
  assert.match(source, /querySelectorAll\('\.reminder-delete-btn'\)/);
  assert.match(source, /reminderItems\s*=\s*reminderItems\.filter\(\(?x\)?\s*=>\s*x\.id !== id\)/);
});

test('renderer supports rule-based reminder scheduling', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /function computeNextTriggerAt\(/);
  assert.match(source, /rule:\s*\{/);
  assert.match(source, /'one-time'/);
  assert.match(source, /nextTriggerAt:/);
  assert.match(source, /item\.nextTriggerAt/);
});

test('renderer skips stale startup reminders and rolls recurring reminders forward', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /function\s+skipPastDueRemindersOnInit\(\)/);
  assert.match(source, /function\s+advanceRecurringReminderToFuture\(item,\s*nowTs,\s*fromTs\)/);
  assert.match(source, /if\s*\(Number\.isNaN\(triggerTs\)\s*\|\|\s*triggerTs\s*>\s*now\)\s*continue;/);
  assert.match(source, /if\s*\(\(item\.rule\?\.type\s*\|\|\s*'one-time'\)\s*===\s*'one-time'\)\s*\{\s*item\.status\s*=\s*'done';/);
  assert.match(source, /item\.status\s*=\s*'done';\s*item\.alertPending\s*=\s*false;/);
  assert.match(source, /advanceRecurringReminderToFuture\(item,\s*now,\s*triggerTs\)/);
  assert.match(source, /\.filter\(\(item\)\s*=>\s*item\.alertPending\s*&&\s*item\.status\s*!==\s*'done'\)/);
  assert.match(source, /skipPastDueRemindersOnInit\(\);\s*pendingAlertIds\s*=\s*\[\];/);
});

test('renderer has no snooze controls or snooze rule data', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.doesNotMatch(source, /snoozeOptions:\s*\[5,\s*10,\s*30\]/);
  assert.doesNotMatch(source, /reminder-snooze-select/);
  assert.doesNotMatch(source, /reminder-snooze-btn/);
});

test('renderer ignores pet click when snooze bar is visible', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'renderer-effects.js'), 'utf8');
  assert.match(
    source,
    /function handleRobotClick\(\) \{[\s\S]*if\s*\(!snoozeBar\.classList\.contains\('hidden'\)\)\s*return;/
  );
});

test('renderer keeps current alert item for snooze confirm and reactivates reminder', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /item\.alertPending = true;/);
  assert.match(source, /queueReminderAlert\(item\)/);
  assert.match(source, /if \(!currentAlertItem\) showNextQueuedAlert\(\);/);
  assert.match(source, /currentAlertItem\.status\s*=\s*'pending';/);
  assert.match(source, /currentAlertItem\.alertPending = false;/);
});

test('reminder alerts are queued and one-time reminders are only completed after acknowledgement', () => {
  const source = fs.readFileSync(reminderModulePath, 'utf8');
  assert.match(source, /if \(item\.status === 'done' \|\| item\.alertPending\) continue;/);
  assert.match(
    source,
    /if \(\(currentAlertItem\.rule\?\.type \|\| 'one-time'\) === 'one-time'\) \{\s*currentAlertItem\.status = 'done';/
  );
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
