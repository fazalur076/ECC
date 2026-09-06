'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const lifecycle = require('../../scripts/lib/project-lifecycle');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc lifecycle '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
const options = { agents: ['claude', 'cursor', 'codex', 'antigravity'], skills: ['ecc-router'] };
test('install, repeat, repair and uninstall preserve unrelated bytes and custom files', t => {
  const root = fixture(t);
  const original = 'My rules\r\nNo final newline';
  fs.writeFileSync(path.join(root, 'AGENTS.md'), original);
  lifecycle.initProject(root, options);
  const first = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  lifecycle.initProject(root, options);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), first);
  assert.equal(lifecycle.doctorProject(root).healthy, true);
  const skill = '.agents/skills/ecc-router/SKILL.md';
  fs.writeFileSync(path.join(root, skill), 'customized damaged content');
  assert.equal(lifecycle.doctorProject(root).healthy, false);
  const repaired = lifecycle.repairProject(root);
  assert.ok(repaired.backups.length);
  assert.equal(lifecycle.doctorProject(root).healthy, true);
  fs.writeFileSync(path.join(root, '.agents/skills/user.md'), 'keep');
  lifecycle.uninstallProject(root);
  assert.equal(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), original);
  assert.equal(fs.readFileSync(path.join(root, '.agents/skills/user.md'), 'utf8'), 'keep');
});
test('unowned files conflict before any writes', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.cursor/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.cursor/rules/ecc-router.mdc'), 'mine');
  assert.throws(() => lifecycle.initProject(root, options), /unowned|conflict/i);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
});
test('symlink directories and traversal in manifest are refused', t => {
  const root = fixture(t);
  const outside = fixture(t);
  fs.symlinkSync(outside, path.join(root, '.agents'));
  assert.throws(() => lifecycle.initProject(root, options), /symlink/i);
  fs.unlinkSync(path.join(root, '.agents'));
  lifecycle.initProject(root, options);
  const config = path.join(root, '.ecc/config.json');
  const data = JSON.parse(fs.readFileSync(config));
  data.files['../outside'] = { hash: 'a'.repeat(64), kind: 'file' };
  fs.writeFileSync(config, JSON.stringify(data));
  assert.throws(() => lifecycle.uninstallProject(root), /path|manifest/i);
});
test('malformed primary manifest recovers from validated backup', t => {
  const root = fixture(t);
  lifecycle.initProject(root, options);
  fs.writeFileSync(path.join(root, '.ecc/config.json'), '{');
  assert.equal(lifecycle.doctorProject(root).healthy, false);
  lifecycle.repairProject(root);
  assert.equal(lifecycle.doctorProject(root).healthy, true);
});
test('updated and damaged markers retain custom text, backups and single valid router', t => {
  const root = fixture(t);
  lifecycle.initProject(root, { agents: ['codex'], skills: ['ecc-router'] });
  const agentFile = path.join(root, 'AGENTS.md');
  fs.appendFileSync(agentFile, '\nCustom instructions after managed block.');
  lifecycle.updateProject(root);
  assert.match(fs.readFileSync(agentFile, 'utf8'), /Custom instructions after/);
  fs.writeFileSync(agentFile, fs.readFileSync(agentFile, 'utf8').replace('<!-- ECC:END -->', ''));
  const result = lifecycle.repairProject(root);
  assert.ok(result.backups.length);
  const repaired = fs.readFileSync(agentFile, 'utf8');
  assert.match(repaired, /Custom instructions after/);
  assert.equal(repaired.split('<!-- ECC:START -->').length, 2);
  assert.equal(lifecycle.doctorProject(root).healthy, true);
});
test('uninstall retains modified owned files and unrelated rules', t => {
  const root = fixture(t);
  lifecycle.initProject(root, options);
  const modified = '.cursor/skills/ecc-router/SKILL.md';
  fs.writeFileSync(path.join(root, modified), 'customized');
  fs.writeFileSync(path.join(root, '.cursor/rules/user.mdc'), 'user rule');
  const result = lifecycle.uninstallProject(root);
  assert.ok(result.preserved.includes(modified));
  assert.equal(fs.readFileSync(path.join(root, modified), 'utf8'), 'customized');
  assert.equal(fs.readFileSync(path.join(root, '.cursor/rules/user.mdc'), 'utf8'), 'user rule');
});
test('shared skills survive removing one agent and update is repeatable', t => {
  const root = fixture(t);
  lifecycle.initProject(root, options);
  lifecycle.updateProject(root, { agents: ['codex'] });
  assert.equal(fs.existsSync(path.join(root, '.agents/skills/ecc-router/SKILL.md')), true);
  assert.equal(fs.existsSync(path.join(root, '.agents/rules/ecc-router.md')), false);
  assert.equal(lifecycle.updateProject(root).changed.length, 0);
});
test('invalid selection and unowned markers have no side effects', t => {
  const root = fixture(t);
  assert.throws(() => lifecycle.initProject(root, { agents: ['unknown'] }), /Unsupported agent/);
  assert.equal(fs.existsSync(path.join(root, '.ecc')), false);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '<!-- ECC:START -->\nmine\n<!-- ECC:END -->');
  assert.throws(() => lifecycle.initProject(root, options), /Unowned ECC marker/);
  assert.equal(fs.existsSync(path.join(root, '.claude')), false);
});
test('crafted ownership cannot claim entire instruction files or unrelated skills', t => {
  const root = fixture(t);
  lifecycle.initProject(root, { agents: ['codex'], skills: ['ecc-router'] });
  const location = path.join(root, '.ecc/config.json');
  const original = fs.readFileSync(location, 'utf8');
  const manifest = JSON.parse(original);
  const instructions = fs.readFileSync(path.join(root, 'AGENTS.md'));
  manifest.files['AGENTS.md'] = { kind: 'file', hash: require('node:crypto').createHash('sha256').update(instructions).digest('hex') };
  fs.writeFileSync(location, JSON.stringify(manifest));
  assert.throws(() => lifecycle.uninstallProject(root), /ownership/);
  assert.deepEqual(fs.readFileSync(path.join(root, 'AGENTS.md')), instructions);
  const second = JSON.parse(original);
  second.files['.agents/skills/user/SKILL.md'] = { kind: 'file', hash: 'a'.repeat(64) };
  fs.writeFileSync(location, JSON.stringify(second));
  assert.throws(() => lifecycle.uninstallProject(root), /ownership/);
});
