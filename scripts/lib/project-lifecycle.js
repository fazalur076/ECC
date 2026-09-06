'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AGENTS, START, END, buildFiles } = require('./project-adapters');
const registry = require('./project-registry');
const SOURCE_ROOT = path.resolve(__dirname, '../..');
const CONFIG = '.ecc/config.json';
const RECOVERY = '.ecc/config.backup.json';
const hash = content => crypto.createHash('sha256').update(content).digest('hex');
function safePath(root, relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)
      || relative.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Unsafe project path: ${relative}`);
  }
  const base = path.resolve(root);
  if (!fs.statSync(base).isDirectory()) throw new Error('Project root must be a directory');
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink refused: ${relative}`);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}
function ownedPath(name) {
  return ['CLAUDE.md', 'AGENTS.md', '.cursor/rules/ecc-router.mdc', '.agents/rules/ecc-router.md'].includes(name)
    || /^\.(?:claude|cursor|agents)\/skills\/[a-z0-9-]+\/.+/.test(name);
}
function validateManifest(root, manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.agents)
      || !Array.isArray(manifest.skills) || !manifest.files || typeof manifest.files !== 'object'
      || Array.isArray(manifest.files)) throw new Error('Invalid or unsupported ECC manifest');
  if (manifest.agents.some(id => !AGENTS.some(agent => agent.id === id))) throw new Error('Invalid manifest agents');
  const selectedSkills = registry.selectSkills(manifest.skills);
  const expected = new Map();
  const prefixes = [];
  for (const id of manifest.agents) {
    const adapter = AGENTS.find(agent => agent.id === id);
    if (adapter.instructions) expected.set(adapter.instructions, 'marker');
    if (adapter.rule) expected.set(adapter.rule, 'file');
    prefixes.push(...selectedSkills.map(skill => `${adapter.skillsPath}/${skill}/`));
  }
  for (const [name, info] of Object.entries(manifest.files)) {
    safePath(root, name);
    if (!ownedPath(name) || !info || !(expected.get(name) === info.kind || (info.kind === 'file' && prefixes.some(prefix => name.startsWith(prefix)))) || !['file', 'marker'].includes(info.kind)
        || !/^[a-f0-9]{64}$/.test(info.hash)) throw new Error(`Invalid manifest ownership path: ${name}`);
    if (info.kind === 'marker' && (!['CLAUDE.md', 'AGENTS.md'].includes(name)
        || typeof info.block !== 'string' || hash(info.block) !== info.hash
        || !['', '\n\n'].includes(info.separator) || typeof info.created !== 'boolean')) throw new Error('Invalid manifest marker');
  }
  registry.selectSkills(manifest.skills);
  return manifest;
}
function readManifest(root, options = {}) {
  const location = safePath(root, options.backup ? RECOVERY : CONFIG);
  if (!fs.existsSync(location)) return null;
  return validateManifest(root, JSON.parse(fs.readFileSync(location, 'utf8')));
}
function read(root, name) {
  const location = safePath(root, name);
  if (!fs.existsSync(location)) return null;
  if (!fs.statSync(location).isFile()) throw new Error(`Expected file: ${name}`);
  return fs.readFileSync(location);
}
function write(root, name, content) {
  const target = safePath(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, content, { flag: 'wx' });
    fs.renameSync(temporary, target);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function markerRange(text) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start < 0 && end < 0) return null;
  if (start < 0 || end < start || text.indexOf(START, start + START.length) >= 0
      || text.indexOf(END, end + END.length) >= 0) throw new Error('Broken or duplicated ECC markers');
  return { start, end: end + END.length };
}
function backup(root, name, content, backups) {
  const relative = `.ecc/backups/${crypto.randomUUID()}/${name}`;
  write(root, relative, content);
  backups.push(relative);
}
function inspectFile(root, name, info) {
  const current = read(root, name);
  if (current === null) return 'missing';
  if (info.kind === 'file') return hash(current) === info.hash ? 'ok' : 'modified';
  try {
    const range = markerRange(current.toString());
    return range && hash(current.toString().slice(range.start, range.end)) === info.hash ? 'ok' : 'modified';
  } catch { return 'modified'; }
}
function doctorProject(root) {
  const checks = [];
  const sections = [];
  let manifest = null;
  try {
    manifest = readManifest(root);
    if (!manifest) checks.push({ id: 'manifest', status: 'error', message: 'ECC is not initialized' });
    else {
      checks.push({ id: 'manifest', status: 'ok', message: 'Valid ECC manifest' });
      for (const [name, info] of Object.entries(manifest.files)) {
        const state = inspectFile(root, name, info);
        checks.push({ id: name, status: state === 'ok' ? 'ok' : 'error', message: state });
      }
      const expected = buildFiles(manifest.agents, manifest.skills, SOURCE_ROOT);
      for (const name of expected.keys()) {
        if (!manifest.files[name]) checks.push({ id: name, status: 'error', message: 'Missing ownership record; run repair' });
      }
    }
  } catch (error) { checks.push({ id: 'manifest', status: 'error', message: error.message }); }

  const coreChecks = [
    { name: 'CLI executable', status: 'ok', message: 'CLI executable' },
    { name: 'manifest valid', status: manifest ? 'ok' : 'error', message: manifest ? 'manifest valid' : 'manifest invalid or missing' },
    { name: 'repository detected', status: fs.existsSync(root) ? 'ok' : 'error', message: 'repository detected' },
    { name: 'ECC version compatible', status: manifest?.eccVersion ? 'ok' : 'warn', message: 'ECC version compatible' }
  ];
  sections.push({ name: 'Core', checks: coreChecks });

  if (manifest) {
    const installedSkillsCount = manifest.skills?.length || 0;
    if (manifest.agents.includes('claude')) {
      const routerOk = checks.some(c => c.id === '.claude/skills/ecc-router/SKILL.md' && c.status === 'ok');
      const claudeBlockOk = checks.some(c => c.id === 'CLAUDE.md' && c.status === 'ok');
      sections.push({
        name: 'Claude Code',
        checks: [
          { name: 'configured', status: 'ok', message: 'configured' },
          { name: 'router available', status: routerOk ? 'ok' : 'error', message: 'router available' },
          { name: `${installedSkillsCount} skills available`, status: 'ok', message: `${installedSkillsCount} skills available` },
          { name: 'CLAUDE.md managed block valid', status: claudeBlockOk ? 'ok' : 'error', message: 'CLAUDE.md managed block valid' }
        ]
      });
    }

    if (manifest.agents.includes('cursor')) {
      const routerOk = checks.some(c => c.id === '.cursor/rules/ecc-router.mdc' && c.status === 'ok');
      sections.push({
        name: 'Cursor',
        checks: [
          { name: 'configured', status: 'ok', message: 'configured' },
          { name: 'ecc-router.mdc valid', status: routerOk ? 'ok' : 'error', message: 'ecc-router.mdc valid' },
          { name: 'rules readable', status: 'ok', message: 'rules readable' }
        ]
      });
    }

    if (manifest.agents.includes('antigravity')) {
      const ruleOk = checks.some(c => c.id === '.agents/rules/ecc-router.md' && c.status === 'ok');
      sections.push({
        name: 'Antigravity',
        checks: [
          { name: 'configured', status: 'ok', message: 'configured' },
          { name: 'skills available', status: 'ok', message: `${installedSkillsCount} skills available` },
          { name: 'rules available', status: ruleOk ? 'ok' : 'error', message: 'rules available' }
        ]
      });
    }

    if (manifest.agents.includes('codex')) {
      const agentsBlockOk = checks.some(c => c.id === 'AGENTS.md' && c.status === 'ok');
      sections.push({
        name: 'Codex',
        checks: [
          { name: 'configured', status: 'ok', message: 'configured' },
          { name: 'AGENTS.md block valid', status: agentsBlockOk ? 'ok' : 'error', message: 'AGENTS.md block valid' },
          { name: 'skills available', status: 'ok', message: `${installedSkillsCount} skills available` }
        ]
      });
    }

    if (manifest.integrations?.cortex) {
      try {
        const integrations = require('./project-integrations');
        const cortex = integrations.cortexStatus(root);
        sections.push({
          name: 'Cortex',
          checks: [
            { name: 'executable', status: cortex.executable ? 'ok' : 'error', message: 'executable' },
            { name: 'version compatible', status: cortex.versionVerified || cortex.available ? 'ok' : 'warn', message: 'version compatible' },
            { name: 'repo initialized', status: cortex.initialized ? 'ok' : 'warn', message: 'repo initialized' },
            { name: 'index readable', status: cortex.indexPath && fs.existsSync(cortex.indexPath) ? 'ok' : 'warn', message: 'index readable' },
            { name: 'symbol lookup works', status: cortex.checks?.find(c => c.name === 'symbol')?.ok ? 'ok' : 'warn', message: 'symbol lookup works' },
            { name: 'search works', status: cortex.checks?.find(c => c.name === 'search')?.ok ? 'ok' : 'warn', message: 'search works' },
            { name: 'index synchronized', status: !cortex.stale ? 'ok' : 'warn', message: 'index synchronized' }
          ]
        });
      } catch {}
    }

    if (manifest.components?.includes('architecture') || fs.existsSync(path.join(root, '.architecture'))) {
      const archExists = fs.existsSync(path.join(root, '.architecture'));
      sections.push({
        name: 'Architecture',
        checks: [
          { name: 'initialized', status: archExists ? 'ok' : 'warn', message: archExists ? 'initialized' : 'architecture directory not initialized' },
          { name: 'blueprint valid', status: archExists && fs.existsSync(path.join(root, '.architecture', 'SYSTEM.md')) ? 'ok' : 'warn', message: 'blueprint valid' }
        ]
      });
    }

    if (manifest.components?.includes('design')) {
      sections.push({
        name: 'Design',
        checks: [
          { name: 'design-ui', status: manifest.skills.includes('design-ui') ? 'ok' : 'warn', message: 'design-ui' },
          { name: 'ui-audit', status: manifest.skills.includes('ui-audit') ? 'ok' : 'warn', message: 'ui-audit' },
          { name: 'motion-ui', status: manifest.skills.includes('motion-ui') ? 'ok' : 'warn', message: 'motion-ui' },
          { name: '3d-ui', status: manifest.skills.includes('3d-ui') ? 'ok' : 'warn', message: '3d-ui' },
          { name: 'taste', status: manifest.skills.includes('taste') ? 'ok' : 'warn', message: 'taste' }
        ]
      });
    }
  }

  const errors = checks.filter(check => check.status === 'error').length;
  let sectionPassed = 0;
  let sectionWarnings = 0;
  let sectionFailures = 0;
  for (const s of sections) {
    for (const c of s.checks) {
      if (['ok', 'pass'].includes(c.status)) sectionPassed++;
      else if (c.status === 'warn') sectionWarnings++;
      else sectionFailures++;
    }
  }

  return {
    healthy: errors === 0,
    checks,
    sections,
    passed: sectionPassed,
    warnings: sectionWarnings,
    failures: errors,
    errors
  };
}
function statusProject(root) {
  const doctor = doctorProject(root);
  let manifest = null;
  try { manifest = readManifest(root); } catch { /* Doctor reports the exact parse or safety error. */ }
  let cortex = null;
  if (manifest?.integrations?.cortex) {
    try {
      const integrations = require('./project-integrations');
      cortex = integrations.cortexStatus(root);
    } catch {}
  }
  return {
    initialized: Boolean(manifest),
    manifest,
    project: { root: path.resolve(root), name: path.basename(path.resolve(root)) },
    cortex,
    doctor,
    healthy: doctor.healthy
  };
}
function selection(options, previous) {
  const agents = [...new Set(options.agents || previous?.agents || AGENTS.map(agent => agent.id))];
  if (!agents.length) throw new Error('Select at least one agent');
  const skills = registry.selectSkills(options.skills || (options.components ? registry.selectComponents(options.components) : previous?.skills));
  return { agents, skills };
}
function planFile(root, name, desired, previous, repair) {
  const current = read(root, name);
  const old = previous?.files[name];
  if (!old && current !== null && desired.kind === 'file') throw new Error(`Unowned file conflict: ${name}`);
  if (desired.kind === 'file') return { ...desired, current, content: desired.content, info: { kind: 'file', hash: hash(desired.content) } };
  const text = current?.toString() || '';
  let range;
  try { range = markerRange(text); } catch (error) {
    if (!repair || !old) throw new Error(`${name}: ${error.message}`);
    // Preserve every byte of the damaged instructions in a backup and retain all
    // non-marker text in place: a missing boundary cannot establish ownership.
    const preserved = text.replaceAll(START, '').replaceAll(END, '');
    const content = `${preserved}\n\n${desired.content}`;
    return { current, content, damaged: true, info: { kind: 'marker', hash: hash(desired.content), block: desired.content, separator: '\n\n', created: false } };
  }
  if (range && !old) throw new Error(`Unowned ECC marker conflict: ${name}`);
  const separator = old?.separator ?? (text ? '\n\n' : '');
  const content = range ? text.slice(0, range.start) + desired.content + text.slice(range.end) : text + separator + desired.content;
  return { current, content, info: { kind: 'marker', hash: hash(desired.content), block: desired.content, separator, created: old?.created ?? current === null } };
}
function applyProject(root, options = {}, mode = 'init') {
  safePath(root, CONFIG);
  safePath(root, RECOVERY);
  safePath(root, '.ecc/backups');
  let previous;
  let damagedManifest;
  try { previous = readManifest(root); } catch (error) {
    if (mode !== 'repair') throw error;
    previous = readManifest(root, { backup: true });
    if (!previous) throw new Error('Manifest damaged and no valid recovery manifest exists');
    damagedManifest = read(root, CONFIG);
  }
  if (mode !== 'init' && !previous) throw new Error('ECC is not initialized; run ecc init');
  if (!previous && read(root, RECOVERY) !== null) throw new Error('Unowned recovery manifest conflict');
  const selected = selection(options, previous);
  const expected = buildFiles(selected.agents, selected.skills, options.sourceRoot || SOURCE_ROOT);
  const plans = [...expected].map(([name, desired]) => [name, planFile(root, name, desired, previous, mode === 'repair')]);
  // Preflight all old paths as well before making any writes.
  for (const name of Object.keys(previous?.files || {})) read(root, name);
  const backups = [];
  const changed = [];
  if (damagedManifest) backup(root, CONFIG, damagedManifest, backups);
  const files = {};
  for (const [name, plan] of plans) {
    const old = previous?.files[name];
    if (plan.current !== null && (plan.damaged || (old && inspectFile(root, name, old) !== 'ok'))) backup(root, name, plan.current, backups);
    if (plan.current === null || !plan.current.equals(Buffer.from(plan.content))) {
      write(root, name, plan.content);
      changed.push(name);
    }
    files[name] = plan.info;
  }
  for (const [name, info] of Object.entries(previous?.files || {})) {
    if (!expected.has(name)) removeOwned(root, name, info, changed);
  }
  const manifest = { ...previous, schemaVersion: 1, eccVersion: registry.VERSION, ...selected,
    components: options.components || previous?.components || ['router', 'engineering', 'architecture', 'design', 'taste', 'testing', 'review'],
    integrations: options.integrations || previous?.integrations || { cortex: false, archify: false },
    installedAt: previous?.installedAt || new Date().toISOString(),
    updatedAt: changed.length || damagedManifest ? new Date().toISOString() : previous?.updatedAt || new Date().toISOString(), files };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  write(root, RECOVERY, serialized);
  write(root, CONFIG, serialized);
  return { manifest, changed, backups, doctor: doctorProject(root) };
}
function removeOwned(root, name, info, changed) {
  const current = read(root, name);
  if (current === null || inspectFile(root, name, info) !== 'ok') return false;
  if (info.kind === 'file') fs.unlinkSync(safePath(root, name));
  else {
    const text = current.toString();
    const range = markerRange(text);
    const prefix = text.slice(0, range.start);
    const separator = info.separator || '';
    const remaining = (separator && prefix.endsWith(separator) ? prefix.slice(0, -separator.length) : prefix) + text.slice(range.end);
    if (!remaining && info.created) fs.unlinkSync(safePath(root, name));
    else write(root, name, remaining);
  }
  changed.push(name);
  return true;
}
function uninstallProject(root) {
  const manifest = readManifest(root);
  if (!manifest) return { changed: [], preserved: [] };
  safePath(root, RECOVERY);
  for (const name of Object.keys(manifest.files)) read(root, name);
  const changed = [];
  const preserved = [];
  for (const [name, info] of Object.entries(manifest.files)) {
    if (!removeOwned(root, name, info, changed) && read(root, name) !== null) preserved.push(name);
  }
  fs.unlinkSync(safePath(root, CONFIG));
  if (fs.existsSync(safePath(root, RECOVERY))) fs.unlinkSync(safePath(root, RECOVERY));
  return { changed, preserved };
}
module.exports = { safePath, readManifest, initProject: (root, options) => applyProject(root, options),
  updateProject: (root, options) => applyProject(root, options, 'update'),
  repairProject: (root, options) => applyProject(root, options, 'repair'), uninstallProject, doctorProject, statusProject };
