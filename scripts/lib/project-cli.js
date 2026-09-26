const fs = require('fs');
const path = require('path');
const { choose, confirm } = require('./project-prompts');
const { detectProject } = require('./project-detector');
const lifecycle = require('./project-lifecycle');
const { AGENTS, SKILLS, selectSkills } = require('./project-registry');
const integration = require('./project-integrations');
const architecture = require('./project-architecture');

const COMMANDS = ['init', 'install', 'status', 'doctor', 'repair', 'update', 'uninstall', 'agents', 'skills', 'cortex', 'architecture'];
const LABELS = { claude: 'Claude Code', cursor: 'Cursor', antigravity: 'Antigravity', codex: 'Codex' };
const COMPONENTS = ['router', 'engineering', 'architecture', 'orchestration', 'design', 'taste', 'testing', 'review', 'security', 'performance', 'debugging'];
function projectExists(cwd) {
  let root = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(root, '.ecc/config.json'))) return true;
    if (fs.existsSync(path.join(root, '.git'))) return false;
    const parent = path.dirname(root);
    if (parent === root) return false;
    root = parent;
  }
}
function shouldHandle(args, cwd = process.cwd()) {
  const command = args.find(arg => arg !== '--dry-run');
  if (!command) return true;
  if (['init', 'agents', 'skills', 'cortex', 'architecture', 'update'].includes(command)) return true;
  if (!COMMANDS.includes(command)) return false;
  const legacy = ['--target', '--profile', '--modules', '--guided', '--harness', '--config', '--scope', '--markdown', '--write', '--exit-code'];
  if (args.some(arg => legacy.some(flag => arg === flag || arg.startsWith(`${flag}=`)))) return false;
  if (command === 'install') return args.every(arg => arg.startsWith('-') || ['install', ...AGENTS].includes(arg) || arg.includes(','));
  return projectExists(cwd);
}
function parse(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) { positional.push(arg); continue; }
    if (['--yes', '--all', '--json', '--verbose', '--dry-run', '--help', '-h', '--no-cortex', '--cortex'].includes(arg)) {
      options[arg.replace(/^--?/, '')] = true; continue;
    }
    if (['--agent', '--agents', '--components', '--skills'].includes(arg)) {
      if (!args[i + 1] || args[i + 1].startsWith('-')) throw new Error(`Missing value for ${arg}`);
      const key = arg === '--agent' ? 'agents' : arg.slice(2);
      options[key] = [...(options[key] || []), ...args[++i].split(',')]; continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (positional.length > 2) throw new Error('Too many arguments.');
  for (const agent of options.agents || []) if (!AGENTS.includes(agent)) throw new Error(`Unknown agent: ${agent}`);
  for (const component of options.components || []) if (!COMPONENTS.includes(component)) throw new Error(`Unknown component: ${component}`);
  if (options.skills) selectSkills(options.skills);
  return { command: positional[0], action: positional[1], options };
}
function output(value, options) {
  if (options.json) { console.log(JSON.stringify(value, null, 2)); return; }
  if (value.sections) {
    console.log('ECC Doctor\n');
    for (const section of value.sections) {
      console.log(section.name);
      for (const check of section.checks) {
        const mark = ['pass', 'ok'].includes(check.status) ? '✓' : check.status === 'warn' ? '○' : '✗';
        console.log(`  ${mark} ${check.message}`);
      }
      console.log();
    }
    if (options.verbose && value.checks) {
      console.log('Files');
      for (const check of value.checks) {
        const mark = ['pass', 'ok'].includes(check.status) ? '✓' : check.status === 'warn' ? '○' : '✗';
        console.log(`  ${mark} ${check.id}: ${check.message}`);
      }
      console.log();
    }
    console.log('Result');
    console.log(`  ${value.passed || 0} passed`);
    console.log(`  ${value.warnings || 0} warnings`);
    console.log(`  ${value.failures || 0} failures\n`);
    console.log(`ECC Doctor: ${value.healthy ? 'healthy' : 'needs attention'}`);
    return;
  }
  if (value.manifest !== undefined && value.doctor !== undefined) {
    const manifest = value.manifest;
    if (!manifest) {
      console.log('ECC is not initialized in this repository. Run ecc init.');
      return;
    }
    console.log(`ECC ${manifest.eccVersion || '2.2.1'}\n`);
    console.log('Project');
    console.log(`  ${value.project?.name || path.basename(process.cwd())}\n`);
    console.log('Agents');
    for (const agent of manifest.agents || []) {
      console.log(`  ${(LABELS[agent] || agent).padEnd(14)} installed`);
    }
    console.log();
    console.log('Router');
    console.log('  active\n');
    console.log('Skills');
    console.log(`  ${manifest.skills?.length || 0} installed\n`);
    console.log('Cortex');
    if (manifest.integrations?.cortex) {
      const cortexHealthy = value.cortex?.healthy;
      console.log(`  connected\n  index ${cortexHealthy ? 'healthy' : 'needs sync'}\n`);
    } else {
      console.log('  disabled (optional)\n');
    }
    console.log('Architecture');
    console.log(`  ${manifest.components?.includes('architecture') ? 'initialized' : 'not enabled'}\n`);
    console.log('Last update');
    console.log(`  ${manifest.updatedAt || manifest.installedAt || 'unknown'}\n`);
    console.log('Health');
    console.log(`  ${value.healthy ? 'healthy' : 'needs attention'}`);
    return;
  }
  if (value.checks) {
    for (const check of value.checks) console.log(`${['pass', 'ok'].includes(check.status) ? '✓' : check.status === 'warn' ? '○' : '✗'} ${check.id}: ${check.message}`);
    console.log(`\nECC Doctor: ${value.healthy ? 'healthy' : 'needs attention'}`);
  } else console.log(JSON.stringify(value, null, 2));
}
function showDetection(project) {
  console.log(`\nECC — Engineered Agentic Coding\n\nProject\n  ${project.root}\n\nDetected`);
  console.log(`  ${project.git ? '✓ Git repository' : '○ No Git repository'}\n  ${[...project.languages, ...project.frameworks].join(', ') || 'No stack manifest detected'}`);
}
async function authorize(options, summary) {
  if (options['dry-run']) { console.log(`Dry run: ${summary}`); return false; }
  if (options.yes) return true;
  if (!process.stdin.isTTY) throw new Error('Confirmation required. Run interactively or pass --yes.');
  return confirm(`${summary}\nApply these project-local changes?`);
}
function selectedSkills(components) {
  if (!components) return undefined;
  const mapping = { router: ['ecc-router'], engineering: ['plan', 'understand-codebase', 'architecture'], architecture: ['blueprint', 'architecture-sync'], orchestration: ['chief-of-staff'], design: ['design-ui', 'ui-audit', 'ui-reference', 'motion-ui', '3d-ui', 'design-system'], taste: ['taste'], testing: ['tdd-workflow'], review: ['code-review'], security: ['security-review'], performance: ['performance'], debugging: ['fix'] };
  return selectSkills(components.flatMap(component => mapping[component]));
}
async function setup(project, options, configure) {
  const current = projectExists(project.root) ? lifecycle.readManifest(project.root) : null;
  let agents = options.agents || (options.all ? AGENTS : current?.agents || AGENTS);
  let components = options.components || current?.components || COMPONENTS;
  const interactive = process.stdin.isTTY && !options.yes && !options['dry-run'];
  if (interactive) {
    showDetection(project);
    if (!options.agents && configure !== 'skills') agents = await choose('Which coding agents should ECC configure?', AGENTS.map(id => ({ id, label: LABELS[id] })), agents);
    if (!options.components && configure !== 'agents') components = await choose('ECC components', COMPONENTS.map(id => ({ id, label: id })), components);
  }
  if (!agents.length) throw new Error('Select at least one agent.');
  const tools = integration.detectIntegrations(project.root);
  let cortex = options.cortex || current?.integrations?.cortex || false;
  if (options['no-cortex']) cortex = false;
  if (interactive && !options['no-cortex'] && !options.cortex) {
    console.log(`\nCortex: ${tools.cortex?.available ? 'detected' : 'unavailable or not verified'}\nArchify: ${tools.archify?.available ? 'detected' : 'not detected'}`);
    cortex = await confirm('Enable optional Cortex repository intelligence?');
  }
  const skills = options.skills || selectedSkills(components);
  const settings = { agents, components, skills, integrations: { cortex, archify: Boolean(tools.archify?.available) } };
  if (!await authorize(options, `Configure ${agents.map(id => LABELS[id]).join(', ')}; ${selectSkills(skills).length} skills; components: ${components.join(', ')}; Cortex ${cortex ? 'enabled' : 'disabled'} in ${project.root}.`)) return 0;
  const result = lifecycle.initProject(project.root, settings);
  if (components.includes('architecture')) architecture.architectureInit(project.root);
  if (cortex) {
    const initialized = integration.runCortex(project.root, 'init');
    if (!initialized.ok) {
      if (options.json) output({ ...result, cortex: initialized }, options);
      else console.error(`ECC files installed. Cortex: ${initialized.message} Run ecc cortex install or disable with ecc init --no-cortex --yes.`);
      return 1;
    }
  }
  if (options.json) output(result, options);
  else console.log(`ECC configured for ${agents.map(id => LABELS[id]).join(', ')}. Run ecc doctor, then use your coding agent normally.`);
  return 0;
}
async function controlCenter(project, options) {
  if (!projectExists(project.root)) {
    if (!process.stdin.isTTY) { showDetection(project); console.log('\nRun ecc init --all --yes for noninteractive setup, or ecc in a terminal.'); return 0; }
    return setup(project, options);
  }
  if (!process.stdin.isTTY) { output(lifecycle.statusProject(project.root), options); return 0; }
  const status = lifecycle.statusProject(project.root);
  console.log(`\nECC — ${project.name}\n${status.manifest?.agents.map(id => `✓ ${LABELS[id]}`).join('\n') || ''}`);
  const choices = ['Status', 'Update ECC', 'Configure agents', 'Configure skills', 'Initialize/update architecture', 'Sync Cortex', 'Run doctor', 'Repair installation', 'Uninstall ECC'];
  const action = await choose('What do you want to do?', choices.map((label, i) => ({ id: String(i), label })), [], false);
  const commands = [['status'], ['update'], ['agents'], ['skills'], ['architecture', 'sync'], ['cortex', 'sync'], ['doctor'], ['repair'], ['uninstall']];
  return runProjectCli(commands[Number(action)], project.root);
}
async function runProjectCli(args, cwd = process.cwd()) {
  const { command, action, options } = parse(args);
  if (options.help || options.h) {
    console.log(`ECC project CLI\n\necc                 Interactive setup or project control center\necc ${COMMANDS.join('|')}\necc cortex status|init|sync|rebuild|doctor|install\necc architecture init|sync|status\n\nOptions: --all --yes --agent NAME --agents NAMES --components NAMES\n         --skills NAMES --cortex --no-cortex --json --verbose --dry-run\n\nGlobal install from checkout: npm install --global .`); return 0;
  }
  const project = detectProject(cwd);
  if (!command) return controlCenter(project, options);
  if (action && !['cortex', 'architecture'].includes(command)) throw new Error(`Unexpected argument: ${action}`);
  if (['init', 'install'].includes(command)) return setup(project, options);
  if (['agents', 'skills'].includes(command)) {
    if (process.stdin.isTTY || options.agents || options.skills || options.components || options.all) return setup(project, options, command);
    output(command === 'agents' ? AGENTS.map(id => ({ id, name: LABELS[id] })) : SKILLS, options); return 0;
  }
  if (command === 'cortex') {
    const operation = action || 'status';
    if (!['status', 'doctor', 'init', 'sync', 'rebuild', 'install'].includes(operation)) throw new Error(`Unknown Cortex action: ${operation}`);
    if (['status', 'doctor'].includes(operation)) { const result = integration.cortexStatus(project.root); output(result, options); return operation === 'doctor' && !result.healthy ? 1 : 0; }
    if (!await authorize(options, `Cortex ${operation} for ${project.root}.`)) return 0;
    const result = integration.runCortex(project.root, operation, { confirmed: options.yes || process.stdin.isTTY });
    output(result, options); return result.ok === false ? 1 : 0;
  }
  if (command === 'architecture') {
    const operation = action || 'status';
    if (!['init', 'sync', 'status'].includes(operation)) throw new Error(`Unknown architecture action: ${operation}`);
    if (operation !== 'status' && !await authorize(options, `Architecture ${operation} for ${project.root}.`)) return 0;
    output(architecture[`architecture${operation[0].toUpperCase()}${operation.slice(1)}`](project.root), options); return 0;
  }
  if (command === 'status' || command === 'doctor') {
    const result = lifecycle[`${command}Project`](project.root);
    output(result, options); return command === 'doctor' && !result.healthy ? 1 : 0;
  }
  if (['repair', 'update', 'uninstall'].includes(command)) {
    if (!await authorize(options, `${command} ECC-owned files in ${project.root}. User configuration is preserved.`)) return 0;
    const result = lifecycle[`${command}Project`](project.root);
    output(result.doctor || result, options); return result.doctor && !result.doctor.healthy ? 1 : 0;
  }
  throw new Error(`Unknown project command: ${command}`);
}
module.exports = { shouldHandle, parse, runProjectCli };
