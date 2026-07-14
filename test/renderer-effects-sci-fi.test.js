const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const rendererEffectsSource = fs.readFileSync(path.join(__dirname, '..', 'renderer-effects.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

test('double-click effects use sci-fi hologram classes and particles', () => {
  assert.match(rendererEffectsSource, /dbl-holo-scan/);
  assert.match(rendererEffectsSource, /dbl-gravity-pulse/);
  assert.match(rendererEffectsSource, /dbl-orbit-flare/);
  assert.match(rendererEffectsSource, /spawnHologramShards/);
  assert.match(rendererEffectsSource, /spawnOrbitDots/);
  assert.doesNotMatch(rendererEffectsSource, /spawnHearts\(/);
  assert.doesNotMatch(rendererEffectsSource, /spawnMusicNotes\(/);
});

test('renderer preserves the sci-fi double-click animation classes during render', () => {
  assert.match(rendererSource, /dbl-holo-scan/);
  assert.match(rendererSource, /dbl-gravity-pulse/);
  assert.match(rendererSource, /dbl-orbit-flare/);
});

test('double-click css renders hologram scan gravity pulse and orbit flare', () => {
  assert.match(styleSource, /#pet\.dbl-holo-scan/);
  assert.match(styleSource, /#pet\.dbl-gravity-pulse/);
  assert.match(styleSource, /#pet\.dbl-orbit-flare/);
  assert.match(styleSource, /\.hologram-shard/);
  assert.match(styleSource, /\.orbit-dot/);
});
