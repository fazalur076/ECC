const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { execFileSync } = require('node:child_process');
const { architectureInit, architectureSync, architectureStatus } = require('../../scripts/lib/project-architecture');
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc architecture '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { react: '19' } }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export const app = 1;');
  return root;
}
test('blueprint initializes evidence scaffolds and repeated sync is stable', t => {
  const root = fixture(t);
  architectureInit(root);
  const file = path.join(root, '.architecture', 'SYSTEM.md');
  const before = fs.readFileSync(file, 'utf8');
  assert.equal(architectureStatus(root).initialized, true);
  assert.equal(architectureSync(root).changedFiles.length, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});
test('incremental changes update relevant pages and preserve user prose', t => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, '.architecture'));
  fs.writeFileSync(path.join(root, '.architecture', 'SYSTEM.md'), '# Existing architecture\nHuman decisions.\n');
  architectureInit(root);
  const stack = fs.readFileSync(path.join(root, '.architecture', 'STACK.md'), 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'app.js'), 'export const app = 2;');
  assert.equal(architectureStatus(root).stale, true);
  const result = architectureSync(root);
  assert.deepEqual(result.changedFiles, ['src/app.js']);
  assert.equal(fs.readFileSync(path.join(root, '.architecture', 'STACK.md'), 'utf8'), stack);
  assert.match(fs.readFileSync(path.join(root, '.architecture', 'SYSTEM.md'), 'utf8'), /Human decisions/);
});
test('secrets never enter blueprint and ignored files do not cause stale state', t => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.env\n');
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=do-not-copy');
  architectureInit(root);
  fs.writeFileSync(path.join(root, '.env'), 'SECRET=changed');
  assert.equal(architectureStatus(root).stale, false);
  assert.doesNotMatch(fs.readFileSync(path.join(root, '.architecture', 'STACK.md'), 'utf8'), /SECRET/);
});
test('architecture refuses symlink directories and malformed ownership markers', t => {
  const root = fixture(t);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc outside '));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, '.architecture'), 'dir');
  assert.throws(() => architectureInit(root), /symlink/i);
  fs.unlinkSync(path.join(root, '.architecture'));
  fs.mkdirSync(path.join(root, '.architecture'));
  fs.writeFileSync(path.join(root, '.architecture', 'SYSTEM.md'), '<!-- ECC:START -->broken');
  assert.throws(() => architectureInit(root), /marker/i);
});
