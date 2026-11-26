const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('every rendered action has a matching handler', () => {
  for (const file of ['app.js', 'engineer.js']) {
    const source = read(file);
    const used = new Set([
      ...[...source.matchAll(/data-action="([a-z-]+)"/g)].map(match => match[1]),
      ...[...source.matchAll(/btn\("([a-z-]+)"/g)].map(match => match[1]),
    ]);
    const handled = new Set([...source.matchAll(/(?:action|a)==="([a-z-]+)"/g)].map(match => match[1]));
    assert.deepEqual([...used].filter(action => !handled.has(action)), [], file);
  }
});

test('New prompt never repeats the visible prompt when alternatives exist', () => {
  const source = read('app.js').replace(
    /\binit\(\);\s*\}\)\(\);\s*$/,
    'globalThis.interviewTest={state,chooseInterviewPrompt};})();',
  );
  const random = Object.create(Math);
  random.random = () => 0;
  const context = {
    document: { addEventListener() {} },
    crypto: { randomUUID: () => 'test-id' },
    Math: random,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const { state, chooseInterviewPrompt } = context.interviewTest;
  state.interviewPrompts = JSON.parse(read('data/interview_prompts.json'));
  const first = chooseInterviewPrompt();
  assert.equal(state.interviewPrompts.length, 54);
  for (let i = 0; i < 100; i++) {
    assert.notEqual(chooseInterviewPrompt('all', first.id).id, first.id);
  }
  state.interviewRecords = [{ promptId: first.id, review: { overallScore: 2, ratings: { relevance: 2 } } }];
  assert.notEqual(chooseInterviewPrompt('all', first.id).id, first.id);
  state.interviewPrompts = [first];
  assert.equal(chooseInterviewPrompt('all', first.id).id, first.id);
});

test('Engineer OS views and key buttons respond without changing required consistency', () => {
  const source = read('engineer.js').replace(
    /\}\)\(\);\s*$/,
    'globalThis.engineerTest={setView(name){view=name;editing=null;render()},stats,mvdComplete};})();',
  );
  const storage = new Map();
  function boot() {
    let html = '';
    const listeners = {};
    const app = { set innerHTML(value) { html = value; }, get innerHTML() { return html; } };
    const context = {
      document: {
        querySelector: selector => selector === '#engineer-app' ? app : null,
        addEventListener: (type, handler) => { listeners[type] = handler; },
        body: { classList: { toggle() {} } },
      },
      localStorage: {
        getItem: key => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
      },
      crypto: { randomUUID: () => Math.random().toString(36) },
      Intl, Date, Math, URL, structuredClone,
      setInterval() {},
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { context, listeners, html: () => html };
  }
  const first = boot();
  for (const name of ['today', 'week', 'dsa', 'design', 'blog', 'vocab', 'lab', 'paper', 'outage', 'roadmap', 'analytics', 'reviews', 'settings']) {
    first.context.engineerTest.setView(name);
    assert.ok(first.html().length > 200, name);
  }
  const date = '2026-12-03';
  first.listeners.click({ target: { closest: () => ({ dataset: { action: 'inspect', date } }) } });
  first.listeners.change({ target: { dataset: { complete: 'dsa', date }, checked: true } });
  assert.equal(first.context.engineerTest.stats(date).done, 1);
  const reloaded = boot();
  assert.equal(reloaded.context.engineerTest.stats(date).done, 1);
  reloaded.listeners.click({ target: { closest: () => ({ dataset: { action: 'mvd', date } }) } });
  for (const id of ['mvd-dsa', 'mvd-deep', 'mvd-vocab']) {
    reloaded.listeners.change({ target: { dataset: { status: id, date }, value: 'completed' } });
  }
  assert.equal(reloaded.context.engineerTest.mvdComplete(date), true);
  assert.equal(reloaded.context.engineerTest.stats(date).done, 1);
});
