const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const htmlPath = path.join(__dirname, '..', 'index.html');
const cssPath = path.join(__dirname, '..', 'style.css');
const rendererPath = path.join(__dirname, '..', 'renderer.js');
const todoModulePath = path.join(__dirname, '..', 'renderer-todo.js');
const mainPath = path.join(__dirname, '..', 'main.js');
const packagePath = path.join(__dirname, '..', 'package.json');

test('todo list panel exists with add input and list container', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="todo-list"/);
  assert.match(html, /id="todo-add-title"/);
  assert.match(html, /id="todo-add-btn"/);
  assert.match(html, /id="todo-items"/);
  assert.match(html, /id="todo-list-close"/);
});

test('todo list panel reuses shared monitor card structure', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const todoBlockMatch = html.match(/<div id="todo-list"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(todoBlockMatch, 'todo-list block not found');
  assert.match(todoBlockMatch[0], /class="monitor-backdrop"/);
  assert.match(todoBlockMatch[0], /class="monitor-card/);
  assert.match(todoBlockMatch[0], /class="monitor-header"/);
});

test('todo list has modal styles and hidden state', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#todo-list\b/);
  assert.match(css, /#todo-list\.hidden/);
  assert.match(css, /\.todo-item\b/);
});

test('renderer-todo module exposes controller factory', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.match(source, /window\.RobotTodo\s*=\s*\{/);
  assert.match(source, /createTodoController/);
});

test('renderer-todo persists items to localStorage under a dedicated key', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.match(source, /const TODO_STORAGE_KEY = 'todoItems'/);
  assert.match(source, /localStorage\.getItem\(TODO_STORAGE_KEY\)/);
  assert.match(source, /localStorage\.setItem\(TODO_STORAGE_KEY/);
});

test('renderer-todo supports add, toggle done, and delete operations', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.match(source, /function addTodoItem\(/);
  assert.match(source, /function toggleTodoDone\(/);
  assert.match(source, /function deleteTodoItem\(/);
  assert.match(source, /status:\s*'pending'/);
  assert.match(source, /status\s*===\s*'done'\s*\?\s*'pending'\s*:\s*'done'/);
});

test('renderer-todo does not implement recurrence rules', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.doesNotMatch(source, /nextTriggerAt/);
  assert.doesNotMatch(source, /computeNextTriggerAt/);
  assert.doesNotMatch(source, /rule:\s*\{/);
});

test('renderer-todo supports an editable due date (DDL) per item', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.match(source, /dueAt/);
  assert.match(source, /function setTodoDueDate\(/);
  assert.match(source, /function formatCountdown\(/);
  assert.match(source, /function startCountdownTicker\(/);
  assert.match(source, /function stopCountdownTicker\(/);
});

test('renderer-todo DDL editing does not depend on removed recurrence helpers', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.doesNotMatch(source, /function computeNextTriggerAt\(/);
});

test('renderer wires up todo list open/close and menu action', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /action === 'todo-list'/);
  assert.match(source, /todoController\.bindTodoEvents/);
});

test('main process menu includes todo list entry', () => {
  const source = fs.readFileSync(mainPath, 'utf8');
  assert.match(source, /待办清单/);
  assert.match(source, /'todo-list'/);
});

test('package.json build files list includes renderer-todo.js', () => {
  const packageJson = fs.readFileSync(packagePath, 'utf8');
  assert.match(packageJson, /"renderer-todo\.js"/);
});

test('todo list panel provides a due date input for new items', () => {
  const html = fs.readFileSync(htmlPath, 'utf8');
  assert.match(html, /id="todo-add-due"/);
});

test('todo item list renders an editable due date and countdown', () => {
  const source = fs.readFileSync(todoModulePath, 'utf8');
  assert.match(source, /todo-item-due/);
  assert.match(source, /todo-due-edit-btn/);
  assert.match(source, /todo-countdown/);
});

test('todo list has due-date and countdown styles', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /\.todo-item-due\b/);
  assert.match(css, /\.todo-countdown\b/);
});
