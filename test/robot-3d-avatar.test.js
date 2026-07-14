const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const robot3DSource = fs.readFileSync(path.join(__dirname, '..', 'renderer-robot3d.js'), 'utf8');
const robotSvgSource = fs.readFileSync(path.join(__dirname, '..', 'assets', 'robot.svg'), 'utf8');

test('robot 3D avatar uses rounded extruded geometry for depth', () => {
  assert.match(robot3DSource, /createRoundedRectangleShape/);
  assert.match(robot3DSource, /new THREE\.ExtrudeGeometry/);
  assert.match(robot3DSource, /headShell/);
  assert.match(robot3DSource, /torsoShell/);
  assert.doesNotMatch(robot3DSource, /map: texture/);
});

test('robot 3D avatar uses a sci-fi holographic visual language', () => {
  assert.match(robot3DSource, /hologramRing/);
  assert.match(robot3DSource, /visorGlass/);
  assert.match(robot3DSource, /gravityCore/);
  assert.match(robot3DSource, /thrusterLeft/);
  assert.match(robot3DSource, /finLeft/);
});

test('robot fallback svg matches the sci-fi holographic avatar', () => {
  assert.match(robotSvgSource, /hologramRing/);
  assert.match(robotSvgSource, /gravityCore/);
  assert.match(robotSvgSource, /thrusterLeft/);
  assert.match(robotSvgSource, /prismShell/);
  assert.doesNotMatch(robotSvgSource, /FF6A22/);
});
