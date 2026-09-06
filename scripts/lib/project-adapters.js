'use strict';

const fs = require('fs');
const path = require('path');
const AGENTS = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    skillsPath: '.claude/skills',
    instructions: 'CLAUDE.md',
    async detect(projectRoot) {
      const hasSkills = fs.existsSync(path.join(projectRoot, '.claude', 'skills'));
      const hasInstructions = fs.existsSync(path.join(projectRoot, 'CLAUDE.md'));
      return { installed: hasSkills || hasInstructions };
    },
    async install(context) { return { ok: true, agent: 'claude' }; },
    async update(context) { return { ok: true, agent: 'claude' }; },
    async verify(context) {
      const hasSkills = fs.existsSync(path.join(context.projectRoot, '.claude', 'skills'));
      return { ok: hasSkills, agent: 'claude' };
    },
    async repair(context) { return { ok: true, agent: 'claude' }; },
    async uninstall(context) { return { ok: true, agent: 'claude' }; }
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    skillsPath: '.cursor/skills',
    rule: '.cursor/rules/ecc-router.mdc',
    async detect(projectRoot) {
      const hasRule = fs.existsSync(path.join(projectRoot, '.cursor', 'rules', 'ecc-router.mdc'));
      return { installed: hasRule };
    },
    async install(context) { return { ok: true, agent: 'cursor' }; },
    async update(context) { return { ok: true, agent: 'cursor' }; },
    async verify(context) {
      const hasRule = fs.existsSync(path.join(context.projectRoot, '.cursor', 'rules', 'ecc-router.mdc'));
      return { ok: hasRule, agent: 'cursor' };
    },
    async repair(context) { return { ok: true, agent: 'cursor' }; },
    async uninstall(context) { return { ok: true, agent: 'cursor' }; }
  },
  {
    id: 'antigravity',
    displayName: 'Google Antigravity',
    skillsPath: '.agents/skills',
    rule: '.agents/rules/ecc-router.md',
    async detect(projectRoot) {
      const hasRule = fs.existsSync(path.join(projectRoot, '.agents', 'rules', 'ecc-router.md'));
      return { installed: hasRule };
    },
    async install(context) { return { ok: true, agent: 'antigravity' }; },
    async update(context) { return { ok: true, agent: 'antigravity' }; },
    async verify(context) {
      const hasRule = fs.existsSync(path.join(context.projectRoot, '.agents', 'rules', 'ecc-router.md'));
      return { ok: hasRule, agent: 'antigravity' };
    },
    async repair(context) { return { ok: true, agent: 'antigravity' }; },
    async uninstall(context) { return { ok: true, agent: 'antigravity' }; }
  },
  {
    id: 'codex',
    displayName: 'OpenAI Codex',
    skillsPath: '.agents/skills',
    instructions: 'AGENTS.md',
    async detect(projectRoot) {
      const hasInstructions = fs.existsSync(path.join(projectRoot, 'AGENTS.md'));
      return { installed: hasInstructions };
    },
    async install(context) { return { ok: true, agent: 'codex' }; },
    async update(context) { return { ok: true, agent: 'codex' }; },
    async verify(context) {
      const hasInstructions = fs.existsSync(path.join(context.projectRoot, 'AGENTS.md'));
      return { ok: hasInstructions, agent: 'codex' };
    },
    async repair(context) { return { ok: true, agent: 'codex' }; },
    async uninstall(context) { return { ok: true, agent: 'codex' }; }
  }
];
const START = '<!-- ECC:START -->';
const END = '<!-- ECC:END -->';
function routerText(skillsPath) {
  return `Use the ECC workflow router at ${skillsPath}/ecc-router/SKILL.md for normal engineering requests. Read only the selected workflow and its required references, not the entire skill library. Prefer healthy Cortex repository intelligence, verify against actual source and tests, and consult .architecture when present. Meaningful UI work requires the Taste quality gate.\n`;
}
function skillFiles(directory, relative = '') {
  return fs.readdirSync(path.join(directory, relative), { withFileTypes: true }).flatMap(entry => {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlink in canonical skill: ${name}`);
    if (entry.isDirectory()) return skillFiles(directory, name);
    if (!entry.isFile()) throw new Error(`Unsupported skill resource: ${name}`);
    return [{ name, content: fs.readFileSync(path.join(directory, name)) }];
  });
}
function buildFiles(agents, skills, sourceRoot) {
  const result = new Map();
  for (const id of agents) {
    const adapter = AGENTS.find(agent => agent.id === id);
    if (!adapter) throw new Error(`Unsupported agent: ${id}`);
    for (const skill of skills) {
      for (const file of skillFiles(path.join(sourceRoot, 'skills', skill))) {
        result.set(`${adapter.skillsPath}/${skill}/${file.name}`, { kind: 'file', content: file.content });
      }
    }
    if (adapter.instructions) result.set(adapter.instructions, {
      kind: 'marker', content: `${START}\n${routerText(adapter.skillsPath)}${END}`
    });
    if (adapter.rule) result.set(adapter.rule, {
      kind: 'file', content: Buffer.from(id === 'cursor'
        ? `---\ndescription: ECC engineering workflow router\nalwaysApply: true\n---\n\n${routerText(adapter.skillsPath)}`
        : `---\ntrigger: always_on\n---\n\n${routerText(adapter.skillsPath)}`)
    });
  }
  return result;
}
module.exports = { AGENTS, START, END, buildFiles };
