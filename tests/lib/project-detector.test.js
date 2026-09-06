'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { detectProject } = require('../../scripts/lib/project-detector');

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc detector spaces '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), typeof value === 'object' ? JSON.stringify(value) : value);
  }
  return fs.realpathSync(root);
}

test('plain Git root resolves from nested directory including paths with spaces', t => {
  const root = fixture(t, { 'src/deep/readme.md': '' });
  execFileSync('git', ['init', '--quiet', root]);
  const result = detectProject(path.join(root, 'src/deep'));
  assert.equal(result.root, root);
  assert.equal(result.git, true);
  assert.deepEqual(result.languages, []);
});

test('Node React stack derives tools from manifests', t => {
  const root = fixture(t, { 'package.json': { dependencies: { react: '1', express: '1', pg: '1', '@prisma/client': '1' }, devDependencies: { typescript: '1', vite: '1', vitest: '1', eslint: '1', prettier: '1' }, packageManager: 'pnpm@10' }, 'pnpm-lock.yaml': '', Dockerfile: '', '.github/workflows/test.yml': '' });
  const result = detectProject(root);
  for (const [key, value] of Object.entries({ languages: 'typescript', frameworks: 'react', backend: 'express', databases: 'postgresql', orms: 'prisma', buildSystems: 'vite', testFrameworks: 'vitest', linting: 'eslint', formatting: 'prettier', packageManagers: 'pnpm', ci: 'github-actions' })) assert.ok(result[key].includes(value), key);
  assert.equal(result.docker, true);
});

test('monorepo aggregates manifest signals without reading dependency trees', t => {
  const root = fixture(t, { 'package.json': { workspaces: ['apps/*'] }, 'apps/web/package.json': { dependencies: { next: '1' } }, 'apps/server/pyproject.toml': '[project]\ndependencies = ["fastapi>=1", "pytest"]', 'node_modules/hidden/package.json': { dependencies: { angular: '1' } }, 'turbo.json': '{}' });
  const result = detectProject(root);
  assert.equal(result.monorepo, true);
  assert.ok(result.frameworks.includes('nextjs'));
  assert.ok(result.frameworks.includes('fastapi'));
  assert.ok(result.languages.includes('python'));
  assert.ok(result.workspaceTools.includes('turbo'));
  assert.ok(!result.manifests.some(name => name.includes('node_modules')));
});

test('Python and Flutter projects and existing agent configuration', t => {
  const root = fixture(t, { 'requirements.txt': 'django==5\npytest\nsqlalchemy', 'pubspec.yaml': 'name: test\ndependencies:\n  flutter:\n    sdk: flutter', 'CLAUDE.md': 'user', 'AGENTS.md': 'user', '.cursor/rules/user.mdc': 'user', '.agents/rules/user.md': 'user', '.ecc/config.json': '{}' });
  const result = detectProject(root);
  assert.ok(result.frameworks.includes('django'));
  assert.ok(result.mobile.includes('flutter'));
  assert.ok(result.languages.includes('dart'));
  assert.equal(result.ecc, true);
  assert.deepEqual(result.existingAgents, { claude: true, cursor: true, antigravity: true, codex: true });
});

test('malformed manifests are reported; symlinked manifests and secrets are not read', t => {
  const external = fixture(t, { 'package.json': { dependencies: { react: '1' } } });
  const root = fixture(t, { 'pyproject.toml': '[project]', '.env': 'SECRET=never-output', 'apps/bad/package.json': '{bad' });
  fs.symlinkSync(path.join(external, 'package.json'), path.join(root, 'package.json'));
  const result = detectProject(root);
  assert.ok(!result.frameworks.includes('react'));
  assert.ok(result.warnings.some(w => w.includes('apps/bad/package.json')));
  assert.ok(!JSON.stringify(result).includes('never-output'));
});
