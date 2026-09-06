const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.resolve(__dirname, '../../scripts/ecc.js');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc cli spaces '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  spawnSync('git', ['init', '-q', root]);
  return root;
}
function run(root, args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ECC_CORTEX_EXECUTABLE: '/nonexistent/cortex' } });
}
test('plain ecc explains setup without writing in noninteractive use', t => {
  const root = fixture(t);
  const result = run(root, []);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ecc init.*--yes/);
  assert.equal(fs.existsSync(path.join(root, '.ecc')), false);
});
test('project CLI lifecycle preserves user instructions and stabilizes', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# My rules\nUse our conventions.\n');
  for (const args of [['init', '--all', '--yes'], ['init', '--all', '--yes'], ['update', '--yes'], ['update', '--yes']]) {
    const result = run(root, args);
    assert.equal(result.status, 0, result.stderr + result.stdout);
  }
  const instructions = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert.equal(instructions.split('<!-- ECC:START -->').length, 2);
  assert.ok(instructions.startsWith('# My rules\nUse our conventions.\n'));
  const health = run(root, ['doctor', '--json']);
  assert.equal(health.status, 0, health.stdout + health.stderr);
  assert.equal(JSON.parse(health.stdout).healthy, true);
  fs.rmSync(path.join(root, '.cursor/rules/ecc-router.mdc'));
  assert.equal(run(root, ['doctor', '--json']).status, 1);
  const repair = run(root, ['repair', '--yes']);
  assert.equal(repair.status, 0, repair.stdout + repair.stderr);
  assert.equal(run(root, ['uninstall', '--yes']).status, 0);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), '# My rules\nUse our conventions.\n');
});
test('init requires confirmation and validates arguments', t => {
  const root = fixture(t);
  assert.notEqual(run(root, ['init']).status, 0);
  assert.notEqual(run(root, ['init', '--agent', 'unknown', '--yes']).status, 0);
  assert.notEqual(run(root, ['init', '--surprise', '--yes']).status, 0);
  assert.equal(fs.existsSync(path.join(root, '.ecc/config.json')), false);
});

test('project CLI detects various project types and initializes selectively', t => {
  // Test Node + React project
  const nodeRoot = fixture(t);
  fs.writeFileSync(path.join(nodeRoot, 'package.json'), JSON.stringify({
    name: 'my-react-app',
    dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', next: '^14.0.0' },
    devDependencies: { typescript: '^5.0.0' }
  }));
  const initNode = run(nodeRoot, ['init', '--agent', 'claude,cursor', '--yes']);
  assert.equal(initNode.status, 0, initNode.stderr + initNode.stdout);
  assert.equal(fs.existsSync(path.join(nodeRoot, '.claude/skills/ecc-router/SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(nodeRoot, '.cursor/rules/ecc-router.mdc')), true);
  assert.equal(fs.existsSync(path.join(nodeRoot, '.agents/skills/ecc-router/SKILL.md')), false);

  // Status human-readable output
  const statusRes = run(nodeRoot, ['status']);
  assert.equal(statusRes.status, 0);
  assert.match(statusRes.stdout, /Claude Code\s+installed/);
  assert.match(statusRes.stdout, /Cursor\s+installed/);
  assert.match(statusRes.stdout, /Router\s+active/);

  // Status json output
  const statusJsonRes = run(nodeRoot, ['status', '--json']);
  assert.equal(statusJsonRes.status, 0);
  const statusData = JSON.parse(statusJsonRes.stdout);
  assert.equal(statusData.initialized, true);
  assert.deepEqual(statusData.manifest.agents, ['claude', 'cursor']);

  // Doctor human-readable and verbose
  const doctorRes = run(nodeRoot, ['doctor', '--verbose']);
  assert.equal(doctorRes.status, 0);
  assert.match(doctorRes.stdout, /ECC Doctor/);
  assert.match(doctorRes.stdout, /Core/);
  assert.match(doctorRes.stdout, /Claude Code/);
  assert.match(doctorRes.stdout, /Cursor/);
  assert.match(doctorRes.stdout, /Result/);

  // Test Python project
  const pyRoot = fixture(t);
  fs.writeFileSync(path.join(pyRoot, 'pyproject.toml'), '[project]\nname = "my-py-app"\ndependencies = ["fastapi", "uvicorn"]\n');
  const initPy = run(pyRoot, ['init', '--agent', 'antigravity,codex', '--yes']);
  assert.equal(initPy.status, 0, initPy.stderr + initPy.stdout);
  assert.equal(fs.existsSync(path.join(pyRoot, '.agents/rules/ecc-router.md')), true);
  assert.equal(fs.existsSync(path.join(pyRoot, 'AGENTS.md')), true);

  // Test Monorepo
  const monoRoot = fixture(t);
  fs.writeFileSync(path.join(monoRoot, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  fs.writeFileSync(path.join(monoRoot, 'package.json'), JSON.stringify({ name: 'my-monorepo' }));
  const initMono = run(monoRoot, ['init', '--all', '--yes']);
  assert.equal(initMono.status, 0, initMono.stderr + initMono.stdout);

  // Architecture commands
  const archInit = run(monoRoot, ['architecture', 'init', '--yes']);
  assert.equal(archInit.status, 0);
  assert.equal(fs.existsSync(path.join(monoRoot, '.architecture/SYSTEM.md')), true);
  assert.equal(fs.existsSync(path.join(monoRoot, '.architecture/STACK.md')), true);

  const archStatus = run(monoRoot, ['architecture', 'status']);
  assert.equal(archStatus.status, 0);

  const archSync = run(monoRoot, ['architecture', 'sync', '--yes']);
  assert.equal(archSync.status, 0);

  // Cortex command
  const cortexRes = run(monoRoot, ['cortex', 'status', '--json']);
  assert.equal(cortexRes.status, 0);
  const cortexData = JSON.parse(cortexRes.stdout);
  assert.ok(cortexData !== null);
});

test('existing configurations and custom rules are preserved across operations', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Existing Claude Instructions\nCustom team rules.\n');
  fs.mkdirSync(path.join(root, '.cursor/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cursor/rules/custom.mdc'), '---\ndescription: custom rule\n---\nCustom rule body\n');
  fs.mkdirSync(path.join(root, '.agents/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/rules/custom.md'), '---\ntrigger: always\n---\nCustom agent rule\n');

  const initRes = run(root, ['init', '--all', '--yes']);
  assert.equal(initRes.status, 0, initRes.stderr + initRes.stdout);

  // Verify custom files untouched
  assert.equal(fs.readFileSync(path.join(root, '.cursor/rules/custom.mdc'), 'utf8'), '---\ndescription: custom rule\n---\nCustom rule body\n');
  assert.equal(fs.readFileSync(path.join(root, '.agents/rules/custom.md'), 'utf8'), '---\ntrigger: always\n---\nCustom agent rule\n');
  const claudeContent = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(claudeContent.startsWith('# Existing Claude Instructions\nCustom team rules.\n'));
  assert.ok(claudeContent.includes('<!-- ECC:START -->'));

  // Uninstall preserves custom files
  const uninstallRes = run(root, ['uninstall', '--yes']);
  assert.equal(uninstallRes.status, 0);
  assert.equal(fs.readFileSync(path.join(root, '.cursor/rules/custom.mdc'), 'utf8'), '---\ndescription: custom rule\n---\nCustom rule body\n');
  assert.equal(fs.readFileSync(path.join(root, '.agents/rules/custom.md'), 'utf8'), '---\ntrigger: always\n---\nCustom agent rule\n');
  assert.equal(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), '# Existing Claude Instructions\nCustom team rules.\n');
});

