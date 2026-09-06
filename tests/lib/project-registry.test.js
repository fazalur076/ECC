'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { SKILLS, AGENTS, selectSkills, selectComponents, getSkill } = require('../../scripts/lib/project-registry');

test('registry includes valid portable canonical skill sources', () => {
  assert.equal(SKILLS.length, 18);
  for (const skill of SKILLS) {
    assert.deepEqual(skill.supportedAgents, AGENTS);
    assert.ok(skill.version);
    assert.ok(skill.description);
    for (const file of skill.files) assert.ok(fs.existsSync(path.join(__dirname, '../..', file)), file);
    for (const dependency of skill.dependencies) assert.ok(getSkill(dependency));
  }
});
test('selection adds router and transitive dependencies deterministically', () => {
  assert.deepEqual(selectSkills([]), ['ecc-router']);
  const selected = selectSkills(['3d-ui']);
  for (const id of ['ecc-router', '3d-ui', 'taste', 'motion-ui', 'design-system']) assert.ok(selected.includes(id));
  assert.deepEqual(selectSkills(selected), selected);
  assert.equal(new Set(selected).size, selected.length);
  assert.throws(() => selectSkills(['../bad']), /Unknown skill/);
  assert.throws(() => selectSkills('taste'), /array/);
});
test('component selection chooses workflows with mandatory design review', () => {
  const selected = selectComponents(['design']);
  assert.ok(selected.includes('design-ui'));
  assert.ok(selected.includes('taste'));
  assert.ok(!selected.includes('performance'));
  assert.throws(() => selectComponents(['nonsense']), /Unknown component/);
});
