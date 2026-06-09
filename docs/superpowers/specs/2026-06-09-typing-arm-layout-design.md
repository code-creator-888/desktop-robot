# 2026-06-09 Typing Arm Layout Design

## Goal
Fix the visual issue where typing arms look like they appear in two different vertical zones.  
Target result: one clear pair of arms anchored near the keyboard, with readable tapping motion during thinking state.

## Scope
- Only adjust thinking-tech visual behavior.
- Keep existing DOM structure (`#tech-prop`, `.tech-arm-left`, `.tech-arm-right`).
- No JS behavior changes.

## Approach Options
1. **A (chosen)**: CSS-only re-anchor and motion constraints for existing two arms.
2. B: Move arms into `.tech-laptop` subtree and retune all relative coordinates.
3. C: Replace arms with keyboard pseudo-element pulse only.

## Chosen Design
### Architecture / Components
- `index.html`: unchanged for this fix.
- `style.css`:
  - Re-anchor `.tech-arm` around keyboard top edge.
  - Limit tap amplitude and rotation so movement remains attached to keyboard.
  - Keep visibility gated by `#pet-container.thinking-tech`.

### Data Flow / Triggering
- Existing trigger remains: `renderer.js` toggles `thinking-tech` from `isThinking`.
- CSS selectors under `.thinking-tech` activate arms.

### Error Handling / Safety
- Preserve `pointer-events: none` on tech layer.
- Do not alter drag/chat interaction behavior.

### Testing
- Add failing test first in `test/thinking-tech-style.test.js` for:
  - anchored arm top position near keyboard region
  - bounded transform amplitude (small X/Y range)
- Update CSS until tests pass, then run full suite.

## Acceptance Criteria
1. Only one visually coherent pair of arms is perceived.
2. Arms appear attached to keyboard and no longer look split top/bottom.
3. Behavior is visible only in thinking state.
4. Existing interaction behavior remains unchanged.
