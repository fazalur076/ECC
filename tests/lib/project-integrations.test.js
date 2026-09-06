const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { cortexStatus, runCortex, detectIntegrations } = require('../../scripts/lib/project-integrations');

function fixture(t, doctor = '[OK] index_exists Indexed files', version = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc cortex '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, 'cortex');
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fs=require('fs'); const a=process.argv.slice(2); fs.appendFileSync('calls',JSON.stringify(a)+'\\n'); if(a[0]==='--help') console.log('cortex repository intelligence engine\\n init build doctor summary search symbol'); else if(a[0]==='--version') { ${version ? "console.log('cortex 1.2.3')" : 'process.exit(1)'} } else if(a[0]==='doctor') console.log(${JSON.stringify(doctor)}); else console.log('ok');\n`, { mode: 0o755 });
  const indexPath = path.join(root, 'context.db');
  fs.writeFileSync(indexPath, 'fixture');
  return { root, options: { executable, indexPath, home: root } };
}

test('missing Cortex remains optional and is not healthy', t => {
  const { root, options } = fixture(t);
  const status = cortexStatus(root, { ...options, executable: path.join(root, 'absent') });
  assert.equal(status.available, false);
  assert.equal(status.healthy, false);
});
test('Cortex requires successful doctor and queries; records unknown version honestly', t => {
  const { root, options } = fixture(t, '[OK] index_exists Indexed files', false);
  const status = cortexStatus(root, options);
  assert.equal(status.available, true);
  assert.equal(status.version, null);
  assert.equal(status.healthy, true);
  const calls = fs.readFileSync(path.join(root, 'calls'), 'utf8');
  assert.match(calls, /search/);
  assert.match(calls, /symbol/);
});
test('Cortex doctor text failure overrides zero exit code', t => {
  const { root, options } = fixture(t, '[FAIL] index_exists No files indexed');
  assert.equal(cortexStatus(root, options).healthy, false);
});
test('sync uses incremental build and rebuild explicitly uses full flag', t => {
  const { root, options } = fixture(t);
  assert.equal(runCortex(root, 'sync', options).ok, true);
  assert.equal(runCortex(root, 'rebuild', options).ok, true);
  const calls = fs.readFileSync(path.join(root, 'calls'), 'utf8');
  assert.match(calls, /\["build"\]/);
  assert.match(calls, /\["build","--full"\]/);
  assert.throws(() => runCortex(root, 'destroy', options), /Unsupported/);
});
test('install with no configured source gives actionable unavailable result', t => {
  const { root, options } = fixture(t);
  const result = runCortex(root, 'install', { ...options, executable: path.join(root, 'missing'), source: '' });
  assert.equal(result.ok, false);
  assert.match(result.message, /source|ECC_CORTEX_SOURCE/);
});
test('integration detection does not invent an Archify protocol', t => {
  const { root, options } = fixture(t);
  const result = detectIntegrations(root, { cortex: options, archify: { executable: path.join(root, 'missing') } });
  assert.equal(result.archify.available, false);
});
