const readline = require('readline');

function choose(title, choices, selected = [], multiple = true) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('Interactive terminal required; use --yes with explicit options.');
  return new Promise((resolve, reject) => {
    let cursor = 0;
    let selection = new Set(selected);
    const wasRaw = process.stdin.isRaw;
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    const render = (first = false) => {
      if (!first) process.stdout.write(`\x1b[${choices.length + 2}A\x1b[J`);
      process.stdout.write(`${title}\n${choices.map((c, i) => `${i === cursor ? '›' : ' '} ${multiple ? (selection.has(c.id) ? '[x]' : '[ ]') : ''} ${c.label}`).join('\n')}\n${multiple ? 'Space = toggle · ' : ''}↑/↓ = move · Enter = continue\n`);
    };
    const finish = () => {
      process.stdin.removeListener('keypress', onKey);
      process.stdin.setRawMode(Boolean(wasRaw));
      process.stdin.pause();
    };
    const onKey = (_text, key = {}) => {
      if (key.ctrl && key.name === 'c' || key.name === 'escape') { finish(); reject(new Error('Cancelled.')); return; }
      if (key.name === 'return') { finish(); resolve(multiple ? [...selection] : choices[cursor].id); return; }
      if (key.name === 'up') cursor = (cursor + choices.length - 1) % choices.length;
      if (key.name === 'down') cursor = (cursor + 1) % choices.length;
      if (multiple && key.name === 'space') selection = selection.has(choices[cursor].id)
        ? new Set([...selection].filter(id => id !== choices[cursor].id)) : new Set([...selection, choices[cursor].id]);
      render();
    };
    process.stdin.on('keypress', onKey);
    render(true);
  });
}
async function confirm(title) {
  return await choose(title, [{ id: 'no', label: 'No' }, { id: 'yes', label: 'Yes' }], [], false) === 'yes';
}
module.exports = { choose, confirm };
