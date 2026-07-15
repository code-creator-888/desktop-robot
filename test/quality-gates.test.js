const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const packagePath = path.join(root, 'package.json');

test('project exposes repeatable lint and format quality gates', () => {
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

  assert.equal(packageJson.scripts.lint, 'eslint .');
  assert.equal(packageJson.scripts['format:check'], 'prettier --check .');
  assert.ok(packageJson.devDependencies.eslint);
  assert.ok(packageJson.devDependencies.prettier);
  assert.ok(fs.existsSync(path.join(root, 'eslint.config.js')));
  assert.ok(fs.existsSync(path.join(root, '.prettierrc.json')));
  assert.ok(fs.existsSync(path.join(root, '.prettierignore')));
});

test('lint allows intentionally empty recovery catches', () => {
  const eslintConfig = fs.readFileSync(path.join(root, 'eslint.config.js'), 'utf8');

  assert.match(eslintConfig, /'no-empty': \['error', \{ allowEmptyCatch: true \}\]/);
});
