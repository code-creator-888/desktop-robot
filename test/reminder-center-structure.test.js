const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const cssPath = path.join(__dirname, '..', 'style.css');

test('reminder center panel exists with manual and calendar actions', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="reminder-center"/);
  assert.match(html, /id="reminder-add-title"/);
  assert.match(html, /id="reminder-add-time"/);
  assert.match(html, /id="reminder-rule-type"/);
  assert.match(html, /id="reminder-add-btn"/);
  assert.doesNotMatch(html, /id="reminder-import-calendar-btn"/);
  assert.match(html, /id="reminder-list"/);
});

test('reminder center has modal styles and hidden state', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#reminder-center/);
  assert.match(css, /#reminder-center\.hidden/);
  assert.match(css, /#reminder-center[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /\.reminder-list/);
  assert.match(css, /\.reminder-item/);
  assert.doesNotMatch(css, /\.reminder-snooze-select/);
  assert.doesNotMatch(css, /\.reminder-snooze-btn/);
});

test('news panel exists with refresh entry and list container', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="news-panel"/);
  assert.match(html, /id="news-panel-refresh"/);
  assert.match(html, /id="news-panel-status"/);
  assert.match(html, /id="news-list"/);
  assert.match(html, /id="news-panel-close"/);
});

test('news panel has modal styles and list item styles', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#news-panel/);
  assert.match(css, /#news-panel\.hidden/);
  assert.match(css, /\.news-list/);
  assert.match(css, /\.news-item/);
  assert.match(css, /\.news-refresh-btn/);
});

test('settings modal captures pointer events so controls are clickable', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(html, /id="settings-modal"/);
  assert.match(css, /#settings-modal\s*\{[^}]*pointer-events:\s*auto[^}]*\}/);
});
