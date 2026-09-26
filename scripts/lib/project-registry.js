'use strict';

const { version: VERSION } = require('../../package.json');
const AGENTS = Object.freeze(['claude', 'cursor', 'antigravity', 'codex']);
const definitions = [
  ['ecc-router', 'core', [], 'Route natural-language requests to installed workflows', ['cortex']],
  ['understand-codebase', 'understanding', [], 'Trace real execution paths without modifying application code', ['cortex']],
  ['blueprint', 'architecture', ['understand-codebase', 'architecture-sync'], 'Persist evidence-backed architecture knowledge', ['cortex', 'archify']],
  ['architecture', 'architecture', ['understand-codebase', 'architecture-sync'], 'Evaluate system boundaries and architectural tradeoffs', ['cortex', 'archify']],
  ['architecture-sync', 'architecture', [], 'Incrementally synchronize architecture evidence', ['cortex', 'archify']],
  ['team-agent-orchestration', 'orchestration', [], 'Coordinate agent work items, ownership, evidence and merge gates', []],
  ['chief-of-staff', 'orchestration', ['team-agent-orchestration', 'plan', 'code-review'], 'Coordinate parallel agent delivery through isolated worktrees and approval gates', ['cortex']],
  ['plan', 'engineering', [], 'Plan substantial changes from repository evidence', ['cortex']],
  ['fix', 'debugging', ['tdd-workflow', 'code-review'], 'Verify root causes and implement focused regression fixes', ['cortex']],
  ['tdd-workflow', 'testing', [], 'Test meaningful behavior through RED and GREEN evidence', []],
  ['code-review', 'review', [], 'Review correctness, contracts and regression risk', []],
  ['security-review', 'security', [], 'Review actual attack surfaces and trust boundaries', []],
  ['performance', 'performance', [], 'Measure, optimize and compare real hot paths', []],
  ['design-ui', 'design', ['ui-audit', 'ui-reference', 'design-system', 'taste'], 'Build deliberate, production-ready interfaces', []],
  ['ui-audit', 'design', [], 'Inspect interface usability and visual quality', []],
  ['ui-reference', 'design', [], 'Extract and adapt principles from visual references', []],
  ['motion-ui', 'design', ['design-system', 'taste'], 'Implement purposeful accessible motion', []],
  ['3d-ui', 'design', ['motion-ui', 'taste'], 'Build justified spatial experiences with fallbacks', []],
  ['design-system', 'design', ['taste'], 'Maintain canonical tokens and component grammar', []],
  ['taste', 'design', [], 'Review visual quality and require automatic revision', []]
];

const SKILLS = Object.freeze(definitions.map(([id, category, dependencies, description, integrations]) => Object.freeze({
  id,
  name: id,
  description,
  category,
  dependencies: Object.freeze(dependencies),
  files: Object.freeze([`skills/${id}/SKILL.md`]),
  source: `skills/${id}`,
  supportedAgents: AGENTS,
  version: VERSION,
  optionalIntegrations: Object.freeze(integrations),
  alwaysOn: id === 'ecc-router'
})));

function getSkill(id) {
  return SKILLS.find(skill => skill.id === id);
}

function selectSkills(ids) {
  if (ids === undefined) return SKILLS.map(skill => skill.id);
  if (!Array.isArray(ids)) throw new Error('Skills must be an array of skill identifiers');
  const add = (selected, id) => {
    const skill = getSkill(id);
    if (!skill) throw new Error(`Unknown skill: ${String(id)}`);
    if (selected.includes(id)) return selected;
    return skill.dependencies.reduce(add, [...selected, id]);
  };
  const selected = ids.reduce(add, ['ecc-router']);
  return SKILLS.filter(skill => selected.includes(skill.id)).map(skill => skill.id);
}

const COMPONENTS = Object.freeze(Object.fromEntries(Object.entries({
  core: ['ecc-router'],
  engineering: ['plan', 'fix', 'tdd-workflow', 'code-review'],
  understanding: ['understand-codebase'],
  architecture: ['blueprint', 'architecture', 'architecture-sync'],
  orchestration: ['chief-of-staff'],
  design: ['design-ui', 'ui-audit', 'ui-reference', 'motion-ui', '3d-ui', 'design-system', 'taste'],
  taste: ['taste'],
  testing: ['tdd-workflow'],
  review: ['code-review'],
  security: ['security-review'],
  performance: ['performance'],
  debugging: ['fix'],
  cortex: []
}).map(([id, skills]) => [id, Object.freeze(skills)])));

function selectComponents(components) {
  if (components === undefined) return selectSkills();
  if (!Array.isArray(components)) throw new Error('Components must be an array of component identifiers');
  const ids = components.flatMap(component => {
    if (!Object.prototype.hasOwnProperty.call(COMPONENTS, component)) {
      throw new Error(`Unknown component: ${String(component)}`);
    }
    return COMPONENTS[component];
  });
  return selectSkills(ids);
}

module.exports = { VERSION, AGENTS, SKILLS, COMPONENTS, getSkill, selectSkills, selectComponents };
