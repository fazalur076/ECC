/** Persistent, incremental evidence inventory; semantic architecture is authored by agents/humans. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { detectProjectType } = require('./project-detect');
const START = '<!-- ECC:START -->';
const END = '<!-- ECC:END -->';
const PAGES = {
  SYSTEM: 'System overview and verified boundaries', STACK: 'Technology inventory',
  MODULES: 'Modules and responsibilities', ENTRY_POINTS: 'Entry points',
  REQUEST_FLOWS: 'Verified request and event execution paths', DATABASE: 'Data and persistence',
  AUTH: 'Authentication and authorization', INTEGRATIONS: 'External integrations',
  BACKGROUND_JOBS: 'Queues, workers and schedulers', FRONTEND: 'Frontend architecture',
  BACKEND: 'Backend architecture', DEPLOYMENT: 'Deployment and infrastructure', RISKS: 'Risks and open questions'
};
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function safePath(root, relative) {
  const base = path.resolve(root);
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${base}${path.sep}`) && absolute !== base) throw new Error('Architecture path escapes project.');
  let current = absolute;
  while (current.length >= base.length && current !== path.dirname(current)) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error(`Refusing architecture symlink: ${current}`);
    if (current === base) break;
    current = path.dirname(current);
  }
  return absolute;
}
function readState(root) {
  const target = safePath(root, '.architecture/ecc-state.json');
  if (!fs.existsSync(target)) return null;
  let state;
  try { state = JSON.parse(fs.readFileSync(target, 'utf8')); }
  catch { throw new Error('Architecture ECC state is malformed; preserve it and restore from version control.'); }
  if (state.schemaVersion !== 1 || state.generatedBy !== 'ecc' || !state.files || !state.blocks) {
    throw new Error('Architecture ECC state has an unsupported schema.');
  }
  return state;
}
function snapshot(root) {
  const result = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 });
  const names = result.status === 0 ? result.stdout.split('\0') : fs.readdirSync(root);
  return Object.fromEntries([...new Set(names)].sort().filter(name => name &&
    !/(^|\/)(\.git|\.ecc|\.architecture|\.agents|\.claude|\.cursor|node_modules|vendor|dist|build)(\/|$)/.test(name) &&
    !/(^|\/)(\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials[^/]*|secrets?[^/]*)$/i.test(name) &&
    !/^(AGENTS|CLAUDE)\.md$/.test(name)).flatMap(name => {
    const target = path.resolve(root, name);
    if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) return [];
    try {
      const stat = fs.lstatSync(target);
      if (!stat.isFile() || stat.size > 1024 * 1024) return [];
      return [[name, hash(fs.readFileSync(target))]];
    } catch { return []; }
  }));
}
function changes(previous, next) {
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort()
    .filter(name => previous[name] !== next[name]);
}
function pagesFor(name) {
  const pages = ['MODULES'];
  if (/(package\.json|lock|\.toml$|requirements|go\.mod|pubspec|\.csproj$|pom\.xml)/.test(name)) pages.push('STACK');
  if (/(^|\/)(main|index|app|server|cli)\.|routes?\//.test(name)) pages.push('ENTRY_POINTS', 'REQUEST_FLOWS');
  if (/(schema|migration|database|models?\/|prisma)/i.test(name)) pages.push('DATABASE');
  if (/(auth|permission|session|policy)/i.test(name)) pages.push('AUTH');
  if (/(integrations?|webhooks?|clients?\/|mcp)/i.test(name)) pages.push('INTEGRATIONS');
  if (/(worker|queue|cron|job|scheduler)/i.test(name)) pages.push('BACKGROUND_JOBS');
  if (/(\.[jt]sx$|\.vue$|\.svelte$|\.css$|components?\/|pages?\/)/.test(name)) pages.push('FRONTEND');
  if (/(server|backend|api\/|services?\/|controllers?\/)/.test(name)) pages.push('BACKEND');
  if (/(docker|compose|\.github\/|terraform|deploy|vercel|netlify)/i.test(name)) pages.push('DEPLOYMENT');
  return pages;
}
function managedBlock(page, files, root) {
  const relevant = Object.keys(files).filter(name => pagesFor(name).includes(page));
  const evidence = page === 'SYSTEM' ? `Project: ${path.basename(root)}\n\nThis is an evidence inventory, not a verified architecture analysis.` :
    page === 'STACK' ? (() => { const detected = detectProjectType(root); return `Detected languages: ${detected.languages.join(', ') || 'unknown'}\n\nDetected frameworks: ${detected.frameworks.join(', ') || 'unknown'}`; })() :
      relevant.length ? relevant.slice(0, 150).map(name => `- ${JSON.stringify(name)} (${files[name].slice(0, 12)})`).join('\n') : 'No matching manifest/path evidence found. This does not prove absence.';
  return `${START}\nGenerated-by: ecc\n\n${evidence}\n\n${relevant.length > 150 ? `${relevant.length - 150} additional paths omitted; inspect source with Cortex or targeted search.\n\n` : ''}Agent review required: document verified behavior and cite source paths outside this managed block. Trace actual execution before asserting dependencies or flows.\n${END}`;
}
function replaceBlock(content, block) {
  const starts = content.split(START).length - 1;
  const ends = content.split(END).length - 1;
  if (starts !== ends || starts > 1 || (starts && content.indexOf(END) < content.indexOf(START))) {
    throw new Error('Architecture ownership markers are malformed; preserve and resolve manually.');
  }
  if (!starts) return `${content}${content && !content.endsWith('\n') ? '\n' : ''}${content ? '\n' : ''}${block}\n`;
  return content.slice(0, content.indexOf(START)) + block + content.slice(content.indexOf(END) + END.length);
}
function architectureSync(root) {
  root = path.resolve(root);
  const previous = readState(root);
  const files = snapshot(root);
  const changedFiles = changes(previous ? previous.files : {}, files);
  const affected = new Set(previous ? changedFiles.flatMap(pagesFor) : Object.keys(PAGES));
  const blocks = { ...(previous ? previous.blocks : {}) };
  const updatedFiles = [];
  const plans = Object.entries(PAGES).map(([page, title]) => {
    const relative = `.architecture/${page}.md`;
    const target = safePath(root, relative);
    const exists = fs.existsSync(target);
    const content = exists ? fs.readFileSync(target, 'utf8') : `# ${title}\n`;
    // Validate every page before performing any write, including unchanged pages.
    const block = managedBlock(page, files, root);
    const next = replaceBlock(content, block);
    const managed = content.includes(START) ? content.slice(content.indexOf(START), content.indexOf(END) + END.length) : null;
    if (exists && previous && previous.blocks[page] && managed && hash(managed) !== previous.blocks[page]) {
      throw new Error(`Architecture managed content was customized: ${relative}. Preserve it outside the ECC markers before syncing.`);
    }
    return { page, target, relative, block, next, write: !exists || !previous || affected.has(page) };
  });
  fs.mkdirSync(safePath(root, '.architecture/diagrams'), { recursive: true });
  for (const plan of plans) {
    if (plan.write) {
      if (!fs.existsSync(plan.target) || fs.readFileSync(plan.target, 'utf8') !== plan.next) {
        fs.writeFileSync(plan.target, plan.next);
        updatedFiles.push(plan.relative);
      }
      blocks[plan.page] = hash(plan.block);
    }
  }
  const state = { schemaVersion: 1, generatedBy: 'ecc', files, blocks };
  const statePath = safePath(root, '.architecture/ecc-state.json');
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  if (!fs.existsSync(statePath) || fs.readFileSync(statePath, 'utf8') !== serialized) fs.writeFileSync(statePath, serialized);
  return { ok: true, initialized: true, changedFiles, updatedFiles, reviewRequired: true };
}
function architectureInit(root) { return architectureSync(root); }
function architectureStatus(root) {
  try {
    const state = readState(root);
    const missingFiles = Object.keys(PAGES).map(page => `.architecture/${page}.md`)
      .filter(relative => !fs.existsSync(safePath(root, relative)));
    const invalidFiles = [];
    if (state) for (const page of Object.keys(PAGES)) {
      const target = safePath(root, `.architecture/${page}.md`);
      if (!fs.existsSync(target)) continue;
      const content = fs.readFileSync(target, 'utf8');
      try {
        replaceBlock(content, '');
        if (!content.includes(START)) invalidFiles.push(`.architecture/${page}.md`);
      } catch { invalidFiles.push(`.architecture/${page}.md`); }
    }
    const changedFiles = state ? changes(state.files, snapshot(root)) : [];
    return { initialized: !!state, valid: !!state && !missingFiles.length && !invalidFiles.length,
      stale: !!state && changedFiles.length > 0, missingFiles, invalidFiles, changedFiles,
      reviewRequired: true, message: state ? 'Blueprint inventory exists; semantic claims require source review.' : 'Run ecc architecture init.' };
  } catch (error) { return { initialized: false, valid: false, stale: null, message: error.message, missingFiles: [], changedFiles: [] }; }
}
function architectureUninstall(root) {
  const state = readState(root);
  if (!state) return { removed: [], preserved: [] };
  const removed = [];
  const preserved = [];
  for (const [page, title] of Object.entries(PAGES)) {
    const relative = `.architecture/${page}.md`;
    const target = safePath(root, relative);
    if (!fs.existsSync(target)) continue;
    const content = fs.readFileSync(target, 'utf8');
    const start = content.indexOf(START);
    const end = content.indexOf(END);
    if (start < 0 || end < start || hash(content.slice(start, end + END.length)) !== state.blocks[page]) {
      preserved.push(relative); continue;
    }
    const next = content.slice(0, start) + content.slice(end + END.length);
    if (next.trim() === `# ${title}`) { fs.unlinkSync(target); removed.push(relative); }
    else { fs.writeFileSync(target, next); preserved.push(relative); }
  }
  fs.unlinkSync(safePath(root, '.architecture/ecc-state.json'));
  for (const relative of ['.architecture/diagrams', '.architecture']) {
    const directory = safePath(root, relative);
    if (fs.existsSync(directory) && !fs.readdirSync(directory).length) fs.rmdirSync(directory);
  }
  return { removed, preserved };
}
module.exports = { architectureInit, architectureSync, architectureStatus, architectureUninstall };
