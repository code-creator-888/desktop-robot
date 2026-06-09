# Thinking Tech Animation Design

## Background

The desktop robot currently has base motion states (idle/walk/sleep/eat/thinking), but the visual language is still simple.  
Target: add a more sci-fi "holding a laptop and typing" effect when the robot is in **thinking** state, without impacting existing interaction reliability.

## Scope

In scope:
- Visual-only enhancement for thinking state
- Trigger only when `isThinking === true`
- Keep all current drag/click/input behavior intact

Out of scope:
- Model logic changes
- New chat features
- Asset-heavy sprite/canvas pipeline

## Chosen Approach

Use **CSS overlay animation** with minimal DOM additions:
- Add a lightweight prop layer inside `#pet-container`
- Toggle via state-driven class (`thinking-tech`)
- Implement effects by CSS keyframes only (transform/opacity-based)

Why this approach:
- Lowest risk to existing logic
- Minimal file touch surface
- Good visual gain with low implementation complexity

## File-Level Design

### 1) `index.html`

Add a visual sub-layer under the pet container:
- `#tech-prop` wrapper (non-interactive)
- sub-elements for "laptop shell", "screen glow", and "keyboard line effects"

This layer is purely decorative and should not capture pointer events.

### 2) `renderer.js`

Use existing thinking state updates:
- When thinking starts: add `thinking-tech` class on container
- When thinking ends: remove `thinking-tech`

No extra timers, no new async logic, no model flow changes.

### 3) `style.css`

Add styles and keyframes:
- Base hidden style for `#tech-prop`
- Show/fade-in under `.thinking-tech`
- Subtle floating laptop motion
- Keyboard "typing pulse" / scan effect
- Optional arm-like pseudo-motion synchronized to typing rhythm

Performance constraints:
- Animate `transform` and `opacity` only
- Avoid layout-triggering properties

## Behavior Rules

1. Trigger only during thinking state.
2. Animation must not block pointer input (`pointer-events: none`).
3. Robot remains draggable and clickable through the effect.
4. Chat input behavior and model-switch behavior remain unchanged.

## Validation Plan

1. Open chat and send a message:
   - during thinking: sci-fi typing effect visible
   - after response: effect disappears
2. While chat open, click outside then click robot:
   - robot still responds
3. Switch model while chat open:
   - input remains focusable and editable
4. Verify no visual stutter in normal interaction flow.

## Risks and Mitigations

- Risk: overlay steals click events  
  Mitigation: enforce `pointer-events: none` on animation layer.

- Risk: animation degrades responsiveness  
  Mitigation: limit to transform/opacity and low-complexity keyframes.
