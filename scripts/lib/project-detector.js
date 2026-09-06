'use strict';

// Manifest-only detection. Never execute project code or read environment files.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { LANGUAGE_RULES, FRAMEWORK_RULES } = require('./project-detect');
const MAX_DIRECTORIES = 160;
const MAX_ENTRIES = 5000;
const MAX_BYTES = 256 * 1024;
const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'coverage', 'target', '__pycache__', 'venv', 'env', 'Pods']);
const TEXT_MANIFESTS = new Set(['pyproject.toml', 'requirements.txt', 'go.mod', 'Cargo.toml', 'pubspec.yaml', 'Gemfile', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'mix.exs', 'pnpm-workspace.yaml']);
const JSON_MANIFESTS = new Set(['package.json', 'composer.json']);
const FRONTEND = ['nextjs', 'react', 'vue', 'angular', 'svelte', 'remix', 'astro', 'nuxt'];
const BACKEND = ['nextjs', 'nuxt', 'django', 'fastapi', 'flask', 'express', 'nestjs', 'rails', 'gin', 'echo', 'actix', 'axum', 'spring', 'laravel', 'symfony', 'phoenix'];
const TOOLS = {
  buildSystems: { vite: ['vite'], webpack: ['webpack'], rollup: ['rollup'], esbuild: ['esbuild'], parcel: ['parcel'], tsc: ['typescript'] },
  mobile: { 'react-native': ['react-native'], expo: ['expo'], flutter: ['flutter'] },
  databases: { postgresql: ['pg', 'psycopg', 'psycopg2', 'postgres', 'postgresql'], mysql: ['mysql', 'mysql2'], sqlite: ['sqlite3', 'better-sqlite3'], mongodb: ['mongodb', 'mongoose'], redis: ['redis', 'ioredis'] },
  orms: { prisma: ['prisma', '@prisma/client'], drizzle: ['drizzle-orm'], typeorm: ['typeorm'], sequelize: ['sequelize'], sqlalchemy: ['sqlalchemy'], mongoose: ['mongoose'] },
  testFrameworks: { jest: ['jest'], vitest: ['vitest'], playwright: ['@playwright/test', 'playwright'], cypress: ['cypress'], mocha: ['mocha'], pytest: ['pytest'], unittest: ['unittest'], 'flutter-test': ['flutter_test'] },
  linting: { eslint: ['eslint'], biome: ['@biomejs/biome'], ruff: ['ruff'], pylint: ['pylint'] },
  formatting: { prettier: ['prettier'], biome: ['@biomejs/biome'], black: ['black'], ruff: ['ruff'] },
  workspaceTools: { turbo: ['turbo'], nx: ['nx'], lerna: ['lerna'] }
};
const MARKERS = {
  packageManagers: { npm: ['package-lock.json'], pnpm: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'], yarn: ['yarn.lock'], bun: ['bun.lock', 'bun.lockb'], uv: ['uv.lock'], poetry: ['poetry.lock'], pip: ['requirements.txt'], pipenv: ['Pipfile'], cargo: ['Cargo.toml'], go: ['go.mod'], pub: ['pubspec.yaml'], composer: ['composer.json'] },
  buildSystems: { make: ['Makefile'], cmake: ['CMakeLists.txt'], gradle: ['build.gradle', 'build.gradle.kts'], maven: ['pom.xml'] },
  workspaceTools: { turbo: ['turbo.json'], nx: ['nx.json'], lerna: ['lerna.json'], pnpm: ['pnpm-workspace.yaml'] },
  linting: { eslint: ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json'], ruff: ['ruff.toml', '.ruff.toml'], biome: ['biome.json'] },
  formatting: { prettier: ['.prettierrc', '.prettierrc.json', 'prettier.config.js'], biome: ['biome.json'] }
};

function exists(root, name) {
  try { return !fs.lstatSync(path.join(root, name)).isSymbolicLink(); } catch { return false; }
}

function projectRoot(cwd) {
  const start = fs.realpathSync(path.resolve(cwd));
  if (!fs.statSync(start).isDirectory()) throw new Error('Project path must be a directory');
  try {
    const root = execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).trim();
    return { root: fs.realpathSync(root), git: true };
  } catch {
    // A non-Git project can still be configured from any nested directory.
    let current = start;
    let candidate = start;
    while (true) {
      if (['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'pubspec.yaml', '.ecc'].some(name => exists(current, name))) candidate = current;
      if (path.dirname(current) === current) break;
      current = path.dirname(current);
    }
    return { root: candidate, git: false };
  }
}

function directories(root, warnings) {
  const queue = [{ directory: root, depth: 0 }];
  const result = [];
  let entriesSeen = 0;
  while (queue.length && result.length < MAX_DIRECTORIES && entriesSeen < MAX_ENTRIES) {
    const { directory, depth } = queue.shift();
    const names = [];
    try {
      // opendir avoids allocating an unbounded listing of a large source directory.
      const handle = fs.opendirSync(directory);
      try {
        let entry;
        while (entriesSeen < MAX_ENTRIES && (entry = handle.readSync())) {
          entriesSeen += 1;
          if (entry.isFile()) names.push(entry.name);
          if (entry.isDirectory() && depth < 3 && !entry.name.startsWith('.') && !SKIP.has(entry.name) && queue.length < MAX_DIRECTORIES) queue.push({ directory: path.join(directory, entry.name), depth: depth + 1 });
        }
      } finally { handle.closeSync(); }
    } catch { warnings.push(`Cannot inspect ${path.relative(root, directory) || '.'}`); }
    result.push({ directory, names });
  }
  if (queue.length || entriesSeen >= MAX_ENTRIES) warnings.push('Detection scan limit reached; some nested manifests may not be included');
  return result;
}

function readManifest(root, directory, name, warnings) {
  const file = path.join(directory, name);
  const relative = path.relative(root, file);
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink()) return null;
    if (stat.size > MAX_BYTES) { warnings.push(`Manifest exceeds detection size limit: ${relative}`); return null; }
    const text = fs.readFileSync(file, 'utf8');
    return JSON_MANIFESTS.has(name) ? JSON.parse(text) : text;
  } catch { warnings.push(`Cannot parse manifest: ${relative}`); return null; }
}

function dependencies(manifests) {
  const result = new Set();
  for (const [name, content] of Object.entries(manifests)) {
    if (JSON_MANIFESTS.has(name)) {
      for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'require', 'require-dev']) {
        if (content[key] && typeof content[key] === 'object') Object.keys(content[key]).forEach(dep => result.add(dep.toLowerCase()));
      }
    } else {
      // Dependency/config tokens only; neither text nor arbitrary manifest values escape detection.
      const tokens = content.toLowerCase().match(/[@a-z_][a-z0-9_@./-]*/g) || [];
      tokens.forEach(token => result.add(token));
    }
  }
  return result;
}

function inspectDirectory(root, entry, state) {
  const { directory, names } = entry;
  const files = new Set(names);
  const manifests = {};
  for (const name of names.filter(name => JSON_MANIFESTS.has(name) || TEXT_MANIFESTS.has(name))) {
    const content = readManifest(root, directory, name, state.warnings);
    if (content !== null) { manifests[name] = content; state.manifests.push(path.relative(root, path.join(directory, name))); }
  }
  const deps = dependencies(manifests);
  for (const rule of LANGUAGE_RULES) {
    if (rule.markers.some(name => files.has(name)) || names.some(name => rule.extensions.includes(path.extname(name)))) state.languages.add(rule.type);
  }
  if (files.has('pubspec.yaml')) state.languages.add('dart');
  if (deps.has('typescript')) state.languages.add('typescript');
  for (const rule of FRAMEWORK_RULES) {
    if (rule.markers.some(name => files.has(name)) || rule.packageKeys.some(key => deps.has(key))) state.frameworks.add(rule.framework);
  }
  for (const [field, mapping] of Object.entries(TOOLS)) {
    for (const [tool, keys] of Object.entries(mapping)) if (keys.some(key => deps.has(key))) state[field].add(tool);
  }
  for (const [field, mapping] of Object.entries(MARKERS)) {
    for (const [tool, keys] of Object.entries(mapping)) if (keys.some(key => files.has(key))) state[field].add(tool);
  }
  const pkg = manifests['package.json'];
  if (pkg && typeof pkg === 'object') {
    const manager = typeof pkg.packageManager === 'string' && pkg.packageManager.match(/^(npm|pnpm|yarn|bun)@/);
    if (manager) state.packageManagers.add(manager[1]);
    if (pkg.workspaces) { state.monorepo = true; state.workspaceTools.add('npm-workspaces'); }
    if (!state.packageManagers.size) state.packageManagers.add('npm');
    if (pkg.scripts && Object.values(pkg.scripts).some(value => typeof value === 'string' && /\bnode\s+--test\b/.test(value))) state.testFrameworks.add('node-test');
  }
  if (names.some(name => /^(Dockerfile(?:\..*)?|docker-compose\.ya?ml|compose\.ya?ml)$/.test(name))) state.docker = true;
}

function detectProject(cwd = process.cwd()) {
  const located = projectRoot(cwd);
  const state = { ...located, projectDir: located.root, name: path.basename(located.root), monorepo: false, docker: false, manifests: [], warnings: [] };
  for (const field of ['languages', 'frameworks', 'packageManagers', ...Object.keys(TOOLS)]) state[field] = new Set();
  directories(state.root, state.warnings).forEach(entry => inspectDirectory(state.root, entry, state));
  state.monorepo = state.monorepo || state.workspaceTools.size > 0;
  for (const [key, value] of Object.entries(state)) if (value instanceof Set) state[key] = [...value].sort();
  state.frontend = state.frameworks.filter(name => FRONTEND.includes(name));
  state.backend = state.frameworks.filter(name => BACKEND.includes(name));
  state.ci = Object.entries({ 'github-actions': '.github/workflows', gitlab: '.gitlab-ci.yml', circleci: '.circleci', jenkins: 'Jenkinsfile', azure: 'azure-pipelines.yml' }).filter(([, file]) => exists(state.root, file)).map(([name]) => name);
  state.existingAgents = Object.fromEntries(Object.entries({ claude: ['CLAUDE.md', '.claude'], cursor: ['.cursor', '.cursorrules'], antigravity: ['.agents/rules', '.agent'], codex: ['AGENTS.md', '.codex', '.agents/skills'] }).map(([agent, markers]) => [agent, markers.some(marker => exists(state.root, marker))]));
  state.ecc = exists(state.root, '.ecc/config.json');
  state.manifests.sort();
  return state;
}

module.exports = { detectProject, projectRoot };
