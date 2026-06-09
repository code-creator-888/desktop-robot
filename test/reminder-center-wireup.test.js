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

test('preload exposes calendar fetch for reminder import', () => {
  const source = fs.readFileSync(preloadPath, 'utf8');
  assert.doesNotMatch(source, /getCalendarEvents:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('get-calendar-events'\)/);
});

test('main process includes reminder menu and calendar IPC', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /提醒中心/);
  assert.doesNotMatch(source, /ipcMain\.handle\('get-calendar-events'/);
});
