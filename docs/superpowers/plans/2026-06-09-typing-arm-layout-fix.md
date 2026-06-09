# Typing Arm Layout Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make thinking-state typing arms appear as one coherent pair anchored to the keyboard area (no top/bottom split illusion).

**Architecture:** Keep current DOM and JS trigger model unchanged. Fix the issue by tightening CSS anchor coordinates, z-layer constraints, and tap transform ranges so both arms visually belong to a single keyboard interaction zone. Guard behavior with existing `.thinking-tech` selector.

**Tech Stack:** Electron renderer, HTML, CSS, Node built-in test runner (`node --test`)

---

### Task 1: Add failing test for anchored arm geometry

**Files:**
- Modify: `test/thinking-tech-style.test.js`
- Test: `test/thinking-tech-style.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('typing arms stay anchored to keyboard region', () => {
  const css = fs.readFileSync(cssPath, 'utf8');
  assert.match(css, /#tech-prop[\s\S]*top:\s*8px/);
  assert.match(css, /\.tech-arm[\s\S]*top:\s*7px/);
  assert.match(css, /@keyframes tech-arm-tap-left[\s\S]*translate\(-2px,\s*3px\)/);
  assert.match(css, /@keyframes tech-arm-tap-right[\s\S]*translate\(2px,\s*3px\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/thinking-tech-style.test.js`  
Expected: FAIL until arm anchor/motion values are corrected.

- [ ] **Step 3: Commit**

```bash
git add test/thinking-tech-style.test.js
git commit -m "test: add failing typing-arm anchor checks"
```

### Task 2: Fix arm anchor and tap motion in CSS

**Files:**
- Modify: `style.css`
- Test: `test/thinking-tech-style.test.js`

- [ ] **Step 1: Write minimal implementation**

```css
#tech-prop {
  top: 8px;
  z-index: 120;
}

.tech-arm {
  top: 7px;
  width: 14px;
  height: 4px;
  z-index: 2;
}

.tech-arm-left {
  left: -10px;
  transform: rotate(-16deg);
}

.tech-arm-right {
  right: -10px;
  transform: rotate(16deg);
}

@keyframes tech-arm-tap-left {
  0%, 100% { transform: rotate(-16deg) translate(0, 0); }
  50% { transform: rotate(-38deg) translate(-2px, 3px); }
}

@keyframes tech-arm-tap-right {
  0%, 100% { transform: rotate(16deg) translate(0, 0); }
  50% { transform: rotate(38deg) translate(2px, 3px); }
}
```

- [ ] **Step 2: Run targeted test to verify it passes**

Run: `node --test test/thinking-tech-style.test.js`  
Expected: PASS for both visibility and anchor/motion assertions.

- [ ] **Step 3: Commit**

```bash
git add style.css
git commit -m "fix: anchor typing arms to keyboard region"
```

### Task 3: Regression check across full suite

**Files:**
- Test: `test/**/*.test.js`

- [ ] **Step 1: Run full test suite**

Run: `node --test`  
Expected: PASS (no regression in thinking-state toggles or chat interactions).

- [ ] **Step 2: Commit final verification checkpoint**

```bash
git add docs/superpowers/specs/2026-06-09-typing-arm-layout-design.md docs/superpowers/plans/2026-06-09-typing-arm-layout-fix.md test/thinking-tech-style.test.js style.css
git commit -m "chore: finalize typing-arm layout fix plan and implementation prep"
```
