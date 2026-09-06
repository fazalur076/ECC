/** Optional local repository intelligence. Protocol checked against Cortex's Cobra CLI. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

function execute(executable, args, root, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root, encoding: 'utf8', timeout: options.timeout || 5000,
    maxBuffer: 1024 * 1024, shell: false,
    env: options.home ? { ...process.env, HOME: options.home, USERPROFILE: options.home } : process.env
  });
  return { ok: !result.error && result.status === 0, status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`.trim(),
    error: result.error ? result.error.message : null };
}

function findExecutable(name, root, options = {}) {
  const suffixes = process.platform === 'win32' ? ['', '.exe'] : [''];
  const candidates = options.executable ? [options.executable] : [
    path.join(root, '.ecc', 'tools', name + (process.platform === 'win32' ? '.exe' : '')),
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)
      .flatMap(directory => suffixes.map(suffix => path.join(directory, name + suffix)))
  ];
  return candidates.find(candidate => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return fs.statSync(candidate).isFile(); }
    catch { return false; }
  }) || null;
}

function cortexIndex(root, options) {
  if (options.indexPath) return options.indexPath;
  const absolute = path.resolve(root);
  const slug = `${path.basename(absolute)}_${crypto.createHash('sha256').update(absolute).digest('hex').slice(0, 12)}`;
  return path.join(options.home || os.homedir(), '.cortex', 'repos', slug, 'context.db');
}

function cortexStatus(root, options = {}) {
  const executable = findExecutable('cortex', root, options);
  const base = { available: false, executable, healthy: false, version: null,
    versionVerified: false, initialized: false, stale: null, indexPath: null, checks: [] };
  if (!executable) return { ...base, message: 'Cortex is optional and is not installed.' };
  const help = execute(executable, ['--help'], root, options);
  const supported = help.ok && ['build', 'doctor', 'summary', 'search', 'symbol']
    .every(command => new RegExp(`\\b${command}\\b`).test(help.output));
  if (!supported) return { ...base, message: 'Executable does not expose the supported Cortex repository-intelligence protocol.' };
  const version = execute(executable, ['--version'], root, options);
  const indexPath = cortexIndex(root, options);
  const initialized = fs.existsSync(indexPath);
  const detected = { ...base, available: true, indexPath, initialized,
    version: version.ok ? version.output : null, versionVerified: version.ok };
  if (!initialized) return { ...detected, message: 'Cortex index missing; run ecc cortex init.' };
  const doctor = execute(executable, ['doctor'], root, options);
  const doctorOk = doctor.ok && !/\[FAIL\]|\berror\b/i.test(doctor.output);
  const summary = execute(executable, ['summary'], root, options);
  const search = execute(executable, ['search', '--local', 'main'], root, options);
  const symbol = execute(executable, ['symbol', '--local', 'main'], root, options);
  const stale = /\[WARN\].*index_freshness|index.*(?:stale|behind)|stale.*index/i.test(doctor.output);
  const checks = [
    { name: 'doctor', ok: doctorOk, detail: doctor.output },
    { name: 'summary', ok: summary.ok }, { name: 'search', ok: search.ok },
    { name: 'symbol', ok: symbol.ok }
  ];
  return { ...detected, checks, stale, healthy: checks.every(check => check.ok) && !stale,
    message: !doctorOk ? 'Cortex reports an unhealthy index; run ecc cortex doctor.' :
      stale ? 'Cortex index is stale; run ecc cortex sync.' : 'Cortex queries checked.' };
}

function archifyStatus(root, options = {}) {
  const executable = findExecutable('archify', root, options);
  if (!executable) return { available: false, healthy: false, executable: null, message: 'Archify is not installed; ECC blueprints are available.' };
  const version = execute(executable, ['--version'], root, options);
  return { available: version.ok && /archify/i.test(version.output), executable,
    healthy: false, version: version.ok ? version.output : null,
    message: 'Archify automation is not configured: no verified project protocol is available. Existing architecture docs are preserved.' };
}

function installCortex(root, options) {
  const existing = cortexStatus(root, options);
  if (existing.available) return { ok: true, action: 'install', message: 'Cortex is already available.', cortex: existing };
  const source = options.source || process.env.ECC_CORTEX_SOURCE;
  if (!source) return { ok: false, action: 'install', message: 'Set ECC_CORTEX_SOURCE to a trusted local Cortex source checkout, then run ecc cortex install. No remote installer is assumed.' };
  const modulePath = path.join(source, 'go.mod');
  if (!fs.existsSync(modulePath) || !/^module github\.com\/cortex\/cortex\s/m.test(fs.readFileSync(modulePath, 'utf8')) || !fs.existsSync(path.join(source, 'cmd', 'cortex'))) {
    return { ok: false, message: 'Configured source does not match the supported Cortex Go checkout.' };
  }
  if (options.global && !options.confirmed) return { ok: false, message: 'Global Cortex installation requires explicit confirmation.' };
  if (options.global && !options.installDir) return { ok: false, message: 'Global installation requires an explicit installDir.' };
  const base = options.global ? path.resolve(options.installDir) : path.resolve(root);
  const directory = options.global ? path.resolve(options.installDir) : path.join(root, '.ecc', 'tools');
  let current = path.resolve(directory);
  while (current.length >= base.length && current !== path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error('Refusing symlink installation directory.');
    if (current === base) break;
    current = path.dirname(current);
  }
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, process.platform === 'win32' ? 'cortex.exe' : 'cortex');
  if (fs.existsSync(destination)) return { ok: false, message: 'Installation destination already exists; refusing to overwrite it.' };
  const result = execute('go', ['build', '-o', destination, './cmd/cortex'], source, { ...options, timeout: 120000 });
  return { ...result, action: 'install', executable: destination,
    message: result.ok ? 'Cortex built from the configured local checkout.' : 'Cortex build failed.' };
}

function runCortex(root, action, options = {}) {
  if (action === 'install') return installCortex(root, options);
  if (action === 'status') return cortexStatus(root, options);
  const commands = { init: ['init'], sync: ['build'], rebuild: ['build', '--full'], doctor: ['doctor'] };
  if (!Object.hasOwn(commands, action)) throw new Error(`Unsupported Cortex action: ${action}`);
  const status = cortexStatus(root, options);
  if (!status.available) return { ok: false, action, message: status.message };
  const result = execute(status.executable, commands[action], root, { ...options, timeout: options.timeout || 120000 });
  const ok = result.ok && !/\[FAIL\]/.test(result.output);
  return { ...result, ok, action, message: ok ? `Cortex ${action} completed.` : `Cortex ${action} failed.` };
}

function detectIntegrations(root, options = {}) {
  return { cortex: cortexStatus(root, options.cortex || {}), archify: archifyStatus(root, options.archify || {}) };
}
module.exports = { cortexStatus, runCortex, detectIntegrations, archifyStatus, findExecutable };
