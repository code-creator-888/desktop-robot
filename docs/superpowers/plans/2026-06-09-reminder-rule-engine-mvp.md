# Reminder Rule Engine MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal reminder rule engine supporting daily/weekly/workday recurrence plus configurable snooze options (5/10/30 minutes).

**Architecture:** Extend `reminderItems` with `rule` and `nextTriggerAt`, then make reminder polling use `nextTriggerAt` instead of one-shot `dueAt`. Keep UI simple with preset selectors and snooze presets; no custom cron-like syntax. Keep behavior in `renderer.js` with focused helper functions and test via source-assertion tests already used in this repo.

**Tech Stack:** Electron renderer (`renderer.js`), HTML/CSS (`index.html`, `style.css`), Node test runner (`node --test`)

---

### Task 1: Add failing tests for rule fields and recurrence flow

**Files:**
- Modify: `test/reminder-center-wireup.test.js`
- Test: `test/reminder-center-wireup.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('renderer supports rule-based reminder scheduling', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /function computeNextTriggerAt\(/);
  assert.match(source, /rule:\s*\{/);
  assert.match(source, /type:\s*'one-time'/);
  assert.match(source, /nextTriggerAt:/);
  assert.match(source, /item\.nextTriggerAt/);
});

test('renderer supports snooze preset options 5\\/10\\/30', () => {
  const source = fs.readFileSync(rendererPath, 'utf8');
  assert.match(source, /snoozeOptions:\s*\[5,\s*10,\s*30\]/);
  assert.match(source, /reminder-snooze-select/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reminder-center-wireup.test.js`  
Expected: FAIL with missing `computeNextTriggerAt` and missing snooze preset selector assertions.

- [ ] **Step 3: Commit**

```bash
git add test/reminder-center-wireup.test.js
git commit -m "test: add failing checks for reminder rule engine mvp"
```

### Task 2: Implement reminder rule model and recurrence calculation

**Files:**
- Modify: `renderer.js`
- Test: `test/reminder-center-wireup.test.js`

- [ ] **Step 1: Write minimal implementation**

```js
function computeNextTriggerAt(item, nowTs) {
  const now = new Date(nowTs);
  const ruleType = item.rule?.type || 'one-time';
  if (ruleType === 'one-time') return null;
  if (ruleType === 'daily') {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
  if (ruleType === 'weekly') {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (ruleType === 'workday') {
    const d = new Date(now);
    do {
      d.setDate(d.getDate() + 1);
    } while (d.getDay() === 0 || d.getDay() === 6);
    return d.toISOString();
  }
  return null;
}
```

- [ ] **Step 2: Wire `addManualReminder` with rule + `nextTriggerAt`**

```js
rule: { type: selectedRuleType, snoozeOptions: [5, 10, 30] },
nextTriggerAt: dueAt,
```

- [ ] **Step 3: Update `checkDueReminders` to trigger by `nextTriggerAt`**

```js
const triggerTs = new Date(item.nextTriggerAt || item.dueAt).getTime();
if (now < triggerTs) continue;
// trigger speech...
item.nextTriggerAt = computeNextTriggerAt(item, triggerTs);
if (!item.nextTriggerAt) item.status = 'done';
```

- [ ] **Step 4: Run targeted tests**

Run: `node --test test/reminder-center-wireup.test.js`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add renderer.js test/reminder-center-wireup.test.js
git commit -m "feat: add minimal reminder recurrence rule engine"
```

### Task 3: Add simple UI presets for rule type and snooze duration

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `renderer.js`
- Test: `test/reminder-center-structure.test.js`

- [ ] **Step 1: Add failing structure assertions**

```js
assert.match(html, /id="reminder-rule-type"/);
assert.match(html, /class="reminder-snooze-select"/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/reminder-center-structure.test.js`  
Expected: FAIL until new controls are added.

- [ ] **Step 3: Add minimal UI controls**

```html
<select id="reminder-rule-type">
  <option value="one-time">仅一次</option>
  <option value="daily">每天</option>
  <option value="weekly">每周</option>
  <option value="workday">工作日</option>
</select>
```

```js
<select class="reminder-snooze-select" data-id="${item.id}">
  <option value="5">5分钟</option>
  <option value="10">10分钟</option>
  <option value="30">30分钟</option>
</select>
```

- [ ] **Step 4: Wire snooze button to selected option**

```js
const minutes = parseInt(select.value, 10) || 10;
item.nextTriggerAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
```

- [ ] **Step 5: Run targeted tests**

Run: `node --test test/reminder-center-structure.test.js test/reminder-center-wireup.test.js`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add index.html style.css renderer.js test/reminder-center-structure.test.js test/reminder-center-wireup.test.js
git commit -m "feat: add reminder rule presets and snooze options ui"
```

### Task 4: Final regression run

**Files:**
- Test: `test/**/*.test.js`

- [ ] **Step 1: Run full test suite**

Run: `npm test --silent`  
Expected: all tests pass.

- [ ] **Step 2: Commit final polish if needed**

```bash
git add -A
git commit -m "chore: finalize reminder rule engine mvp"
```
