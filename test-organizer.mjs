/**
 * Offline test for the settings-navigation organizer.
 *
 * Covers the three configurable behaviours — grouping (category sub-headers),
 * rename (per-entry display name), and promotion (treat a plugin entry as
 * shipped) — plus the band split, the generated stylesheet, and live wiring.
 *
 * The expected browser behaviour for `order` and for pseudo-elements was
 * measured in a local reproduction of the host's real nav CSS.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'client.js'), 'utf8');
const packageName = JSON.parse(readFileSync(join(here, 'package.json'), 'utf8')).name;
const configFile = JSON.parse(readFileSync(join(here, 'nav-config.json'), 'utf8'));

let registered = null;
const appends = [];
const documentShim = {
  createElement: () => ({ textContent: '', parentNode: null, setAttribute() {}, remove() {} }),
  head: {
    appendChild: (el) => {
      el.parentNode = { removeChild: () => {} };
      appends.push(el);
    }
  }
};
globalThis.document = documentShim;

/* Minimal React shim: enough for structural assertions on the panel tree. */
const HOOK_CALLS = { effect: 0 };
const reactShim = {
  createElement(type, props, ...children) {
    const flat = [];
    for (const child of children) {
      if (Array.isArray(child)) flat.push(...child);
      else if (child !== null && child !== undefined && child !== false) flat.push(child);
    }
    return { type, props: props === null || props === undefined ? { children: flat } : { ...props, children: flat } };
  },
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => { HOOK_CALLS.effect += 1; },
  useRef: () => ({ current: null }),
  useId: () => 'po-panel-title'
};
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      if (spec.id !== packageName) {
        throw new Error('browser module id must equal package.json name: ' + spec.id + ' != ' + packageName);
      }
      registered = spec.factory((name) => {
        if (name === 'react') return reactShim;
        throw new Error('unexpected require: ' + name);
      });
    }
  }
};

new Function('window', 'document', source)(globalThis.window, documentShim);
if (registered === null) throw new Error('bundle registered nothing');
const {
  CONFIG, mergeConfig, readConfig, planNav, buildCss, categoryOf,
  categoryLabel, dictionaries, createOpenStore, panelRows, panelGroups,
  filterPanelRows, PanelTrigger, OrganizerPanel, PANEL_CSS,
  clampPanelPosition, readPanelPosition, writePanelPosition, clearPanelPosition,
  PANEL_POSITION_KEY
} = registered.__internals;

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log('  ok   ' + label);
  else {
    failures += 1;
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' -> ' + detail));
  }
}
const t = (key) => (dictionaries.zh[key] === undefined ? key : dictionaries.zh[key]);

/* Real section orders of this deployment, in the slot service's entry shape. */
const row = (id, order, registrant) => ({ options: { id, order, registrant } });
const FIXTURE = [
  row('account', -10, '@deepseek-ai/dsh-client-ui-settings-account'),
  row('general', 0, '@deepseek-ai/dsh-client-ui-settings-general'),
  row('models', 10, '@deepseek-ai/dsh-client-ui-settings-models'),
  row('plugins', 15, '@deepseek-ai/dsh-client-ui-settings-plugins'),
  row('workbuddy-ai', 16, '@bushizhanghan/dsh-workmate'),
  row('agent-presets', 20, '@deepseek-ai/dsh-client-ui-agent-preset'),
  row('archived-sessions', 25, '@linxin666/dsh-session-archive'),
  row('dshp-vision-bridge', 25, '@dshp/vision-bridge'),
  row('im-assistant', 40, '@michengai/dsh-im-connect'),
  row('web-ui-plugins', 110, '@linxin666/dsh-client-ui-web-ui-settings'),
  row('skin-center', 120, '@linxin666/dsh-client-ui-skin-center'),
  row('pet', 130, '@linxin666/dsh-pet'),
  row('market', 150, '@linxin666/dsh-client-ui-market'),
  row('dsh-usage', 151, '@linxin666/dsh-usage'),
  row('plugin-settings', 900, 'dsh-qoder-connect')
];

console.log('\n1) config plumbing');
check('baked literal equals nav-config.json',
  JSON.stringify(CONFIG) === JSON.stringify(configFile));
check('merge keeps baked values', mergeConfig(CONFIG, {}).grouping.order.length === CONFIG.grouping.order.length);
check('merge overrides one section', mergeConfig(CONFIG, { rename: { pet: '萌宠' } }).rename.pet === '萌宠');
check('readConfig falls back without storage',
  readConfig({}).grouping.enabled === CONFIG.grouping.enabled);
check('readConfig ignores malformed storage', (() => {
  const scope = { localStorage: { getItem: () => '{not json' } };
  return readConfig(scope).grouping.enabled === CONFIG.grouping.enabled;
})());

console.log('\n2) band split (default config)');
const plan = planNav(FIXTURE, CONFIG);
check('5 shipped rows', plan.bandPositions.length === 5, String(plan.bandPositions.length));
check('10 plugin rows', plan.thirdPartyCount === 10, String(plan.thirdPartyCount));
check('shipped rows keep registration order',
  plan.rows.filter((r) => !r.thirdParty).map((r) => r.id).join(',')
    === 'account,general,models,plugins,agent-presets');
check('divider anchors on the first plugin row in visual order',
  plan.firstThirdPartyPosition === plan.groups[0].firstPosition,
  String(plan.firstThirdPartyPosition) + ' vs ' + String(plan.groups[0].firstPosition));
check('visual order is a dense step of ten',
  plan.sequence.every((row, index) => row.visualOrder === 1 + index * 10));
check('agent-presets is not treated as a plugin',
  plan.rows.find((r) => r.id === 'agent-presets').thirdParty === false);

console.log('\n3) grouping into category bands');
check('plugin rows are bucketed into at least two groups', plan.groups.length >= 2, String(plan.groups.length));
check('groups follow the configured order', (() => {
  const declared = CONFIG.grouping.order;
  const ranks = plan.groups.map((g) => declared.indexOf(g.category));
  return ranks.every((value, index) => index === 0 || ranks[index - 1] <= value);
})(), plan.groups.map((g) => g.category).join(','));
check('every plugin row appears in exactly one group',
  plan.groups.reduce((sum, g) => sum + g.positions.length, 0) === plan.thirdPartyCount);
check('each group starts at its first position',
  plan.groups.every((g) => g.positions[0] === g.firstPosition));
check('official rows occupy the lowest visual orders',
  plan.sequence.slice(0, plan.bandPositions.length).every((row) => row.thirdParty === false));
check('plugin rows follow every official row',
  plan.sequence.slice(plan.bandPositions.length).every((row) => row.thirdParty === true));
const labels = {};
plan.groups.forEach((g) => { labels[g.category] = categoryLabel(g.category, CONFIG, t); });
const groupedCss = buildCss(plan, '插件提供 · 10', labels);
check('every plugin row is banded by its own order',
  plan.sequence.filter((row) => row.thirdParty)
    .every((row) => groupedCss.includes(':nth-child(' + row.domPosition + '){order:' + row.visualOrder + '}')));
check('later groups get a sub-caption',
  plan.groups.slice(1).every((g) => groupedCss.includes(':nth-child(' + g.firstPosition + ')::before')));
check('the first plugin row keeps the band header',
  groupedCss.includes('content:"插件提供 · 10"'));
check('the band header sits on the first VISUAL group, not the first DOM row',
  groupedCss.includes(':nth-child(' + plan.groups[0].firstPosition + ')::before{content:"插件提供 · 10"'),
  'groups=' + plan.groups.map((g) => g.category + '@' + g.firstPosition).join(','));
check('no row carries two captions', (() => {
  const positions = [];
  const matches = groupedCss.match(/:nth-child\((\d+)\)::before/g) || [];
  for (const match of matches) positions.push(Number(match.replace(/[^0-9]/g, '')));
  return positions.length === new Set(positions).size;
})(), '双标题行存在');
check('sub-captions use the configured labels',
  groupedCss.includes('content:"' + labels[plan.groups[1].category] + '"'), labels[plan.groups[1].category]);
const patched = mergeConfig(CONFIG, { grouping: { enabled: false } });
const ungrouped = planNav(FIXTURE, patched);
check('grouping can be switched off', ungrouped.groupingEnabled === false);
const ungroupedCss = buildCss(ungrouped, '插件提供 · 10', {});
check('the navigation layer can be switched off',
  buildCss(planNav(FIXTURE, mergeConfig(CONFIG, { nav: { banded: false } })), 'x', {}) === '');
check('the navigation layer is on by default',
  buildCss(planNav(FIXTURE, CONFIG), 'x', {}).length > 0
  && planNav(FIXTURE, CONFIG).navBanded === true);
check('no sub-captions when grouping is off',
  ungroupedCss.split('\n').filter((line) => line.includes('::before')).length === 1);

console.log('\n4) rename');
const renaming = mergeConfig(CONFIG, { rename: { pet: '萌宠', '@linxin666/dsh-usage': '用量统计' } });
const renamed = planNav(FIXTURE, renaming);
check('rename matches a section id', renamed.rows.find((r) => r.id === 'pet').rename === '萌宠');
check('rename matches a package name', renamed.rows.find((r) => r.id === 'dsh-usage').rename === '用量统计');
check('untouched rows carry no rename', renamed.rows.find((r) => r.id === 'general').rename === undefined);
const petPosition = renamed.rows.findIndex((r) => r.id === 'pet') + 1;
const renameCss = buildCss(renamed, '插件提供 · 10', {});
check('the shell label is hidden for a renamed row',
  renameCss.includes(':nth-child(' + petPosition + ') [class*="navLabel"]{display:none}'));
check('the replacement text is drawn on that row',
  renameCss.includes(':nth-child(' + petPosition + ')::after{content:"萌宠"'));
check('replacement text is escaped', buildCss(
  planNav(FIXTURE, mergeConfig(CONFIG, { rename: { pet: 'a"b\\c' } })), 'x', {}
).includes('content:"a\\"b\\\\c"'));

console.log('\n4b) per-entry position');

/** Ids of one category's rows, in visual order. */
const groupIds = (plan2, category) => (plan2.groups.find((g) => g.category === category) || { rows: [] })
  .rows.map((row) => row.id);

const petFirst = planNav(FIXTURE, mergeConfig(CONFIG, { position: { pet: 1 } }));
check('an explicit position lifts a row to the front of its group',
  groupIds(petFirst, petFirst.rows.find((r) => r.id === 'pet').category)[0] === 'pet',
  groupIds(petFirst, petFirst.rows.find((r) => r.id === 'pet').category).join(','));

const llmOrder = planNav(FIXTURE, mergeConfig(CONFIG, { position: { 'dsh-usage': 1, 'dshp-vision-bridge': 2 } }));
check('two explicit positions order a group as asked',
  groupIds(llmOrder, 'llm').join(',') === 'dsh-usage,dshp-vision-bridge',
  groupIds(llmOrder, 'llm').join(','));

const bandMoved = planNav(FIXTURE, mergeConfig(CONFIG, { position: { models: -100 } }));
check('a positioned official entry moves inside the official band',
  bandMoved.sequence[0].id === 'models',
  bandMoved.sequence.slice(0, 5).map((row) => row.id).join(','));
check('the official band keeps its size after a move',
  bandMoved.bandPositions.length === plan.bandPositions.length);

const untouched = planNav(FIXTURE, CONFIG);
check('without overrides every group keeps registration order',
  untouched.groups.every((group) => group.rows.every((row, index) => index === 0
    || group.rows[index - 1].registeredAt <= row.registeredAt)));

const positionedPanel = panelRows(FIXTURE, mergeConfig(CONFIG, { position: { pet: 1 } }));
check('the panel lists rows in the navigation order',
  positionedPanel.findIndex((row) => row.id === 'pet')
    < positionedPanel.findIndex((row) => row.id === 'market'),
  positionedPanel.map((row) => row.id).join(','));

console.log('\n5) treat a plugin entry as shipped');
const promoting = mergeConfig(CONFIG, { official: ['workbuddy-ai'] });
const promoted = planNav(FIXTURE, promoting);
const workbuddy = promoted.rows.find((r) => r.id === 'workbuddy-ai');
check('promoted row leaves the plugin band', workbuddy.thirdParty === false && workbuddy.promoted === true);
check('plugin count drops by one', promoted.thirdPartyCount === 9, String(promoted.thirdPartyCount));
check('band count grows by one', promoted.bandPositions.length === 6, String(promoted.bandPositions.length));
const promotedCss = buildCss(promoted, '插件提供 · 9', {});
check('a promoted row sorts above every plugin row', (() => {
  const promotedRow = promoted.sequence.find((row) => row.promoted === true);
  const firstPlugin = promoted.sequence.find((row) => row.thirdParty === true);
  return promotedRow !== undefined && firstPlugin !== undefined
    && promotedRow.visualOrder < firstPlugin.visualOrder;
})() && promotedCss.length > 0);
check('promotion also matches a package name',
  planNav(FIXTURE, mergeConfig(CONFIG, { official: ['@linxin666/dsh-pet'] }))
    .rows.find((r) => r.id === 'pet').promoted === true);
check('shipped rows are never marked promoted',
  promoted.rows.find((r) => r.id === 'general').promoted === false);

console.log('\n6) categories and labels');
check('explicit assignment wins over keywords',
  categoryOf('pet', '@linxin666/dsh-pet', mergeConfig(CONFIG, { grouping: { assign: { pet: 'tools' } } })) === 'tools',
  categoryOf('pet', '@linxin666/dsh-pet', mergeConfig(CONFIG, { grouping: { assign: { pet: 'tools' } } })));
check('keyword rules still apply without an assignment',
  categoryOf('dsh-tool-bash', '@deepseek-ai/dsh-tool-bash', CONFIG) === 'tools',
  categoryOf('dsh-tool-bash', '@deepseek-ai/dsh-tool-bash', CONFIG));
check('config label wins for a category',
  categoryLabel('tools', mergeConfig(CONFIG, { grouping: { labels: { tools: '工具集' } } }), t) === '工具集');
check('dictionary label used when config has none',
  categoryLabel('llm', mergeConfig(CONFIG, { grouping: { labels: {} } }), t) === '模型');
check('unknown category falls back to its id',
  categoryLabel('custom', mergeConfig(CONFIG, { grouping: { labels: {} } }), t) === 'custom');

console.log('\n7) live wiring');
const effects = [];
const slotSubs = [];
const localeSubs = [];
const injectedSlots = [];
const registrations = [];
let currentSlot = null;
const ctx = {
  effect(fn, label) { effects.push(label); return fn(); },
  locale: {
    register(ns, dicts) { this.registered = { ns, dicts }; },
    bind: () => t,
    subscribe: (fn) => { localeSubs.push(fn); return () => {}; }
  },
  slots: {
    entries: (key) => (key === 'settings.section' ? FIXTURE : []),
    subscribe: (key, fn) => { slotSubs.push({ key, fn }); return () => {}; },
    register(options, component) {
      registrations.push({ slot: currentSlot, options, component });
      return () => {};
    },
    inject(slot, factory) {
      injectedSlots.push(slot);
      currentSlot = slot;
      try { return factory(); } finally { currentSlot = null; }
    }
  }
};
const api = registered.apply(ctx);
check('registers dictionaries', ctx.locale.registered.dicts.zh.navGroup === '插件提供');
check('two style elements (nav rules + panel css)', appends.length === 2, String(appends.length));
check('nav stylesheet written on mount', appends[0].textContent.includes('插件提供 · 10'));
check('panel css injected', appends[1].textContent.includes('@keyframes po-rise'));
check('subscribes to the ledger', slotSubs.length === 1 && slotSubs[0].key === 'settings.section');
check('three effects installed', effects.length === 3, String(effects.length));
check('registers a trigger and an overlay',
  registrations.map((r) => r.slot).join(',') === 'sidebar.footer.action,shell.overlay',
  registrations.map((r) => r.slot).join(','));
check('trigger registration carries a locale label',
  registrations[0].options.label() === '插件设置总览', registrations[0].options.label());
check('overlay registration supplies its deps',
  typeof registrations[1].options.inject === 'function');
check('reload() rewrites the sheet', typeof api.reload === 'function'
  && api.reload() !== undefined
  && appends[0].textContent.includes('插件提供 · 10'));
check('zh and en share one key set',
  JSON.stringify(Object.keys(dictionaries.zh).sort()) === JSON.stringify(Object.keys(dictionaries.en).sort()));

FIXTURE.push(row('brand-new', 160, '@someone/dsh-thing'));
slotSubs[0].fn();
check('a newly installed plugin re-plans the sheet',
  appends[0].textContent.includes('插件提供 · 11'),
  String(appends[0].textContent.split('\n').length) + ' rules');

console.log('\n7b) draggable panel position');
check('clamping keeps the panel inside the viewport',
  JSON.stringify(clampPanelPosition({ left: -40, top: -40 }, { width: 600, height: 400 }, { width: 1200, height: 800 }))
    === JSON.stringify({ left: 8, top: 8 }));
check('clamping stops the panel leaving the far edge',
  JSON.stringify(clampPanelPosition({ left: 5000, top: 5000 }, { width: 600, height: 400 }, { width: 1200, height: 800 }))
    === JSON.stringify({ left: 592, top: 392 }),
  JSON.stringify(clampPanelPosition({ left: 5000, top: 5000 }, { width: 600, height: 400 }, { width: 1200, height: 800 })));
check('a panel larger than the viewport still gets a valid origin',
  JSON.stringify(clampPanelPosition({ left: 300, top: 300 }, { width: 2000, height: 2000 }, { width: 800, height: 600 }))
    === JSON.stringify({ left: 8, top: 8 }));

/** In-memory localStorage double. */
function memoryStorage(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(key, String(value)); },
    removeItem: (key) => { map.delete(key); },
    dump: () => Object.fromEntries(map)
  };
}
const view = { localStorage: memoryStorage() };
check('nothing is remembered initially', readPanelPosition(view) === null);
check('writing remembers both axes', writePanelPosition(view, { left: 120, top: 64 }) === true
  && readPanelPosition(view).left === 120 && readPanelPosition(view).top === 64);
check('the position lives under its own key',
  view.localStorage.dump()[PANEL_POSITION_KEY] !== undefined, Object.keys(view.localStorage.dump()).join(','));
check('clearing forgets it', clearPanelPosition(view) === true && readPanelPosition(view) === null);
check('malformed storage is ignored',
  readPanelPosition({ localStorage: memoryStorage({ [PANEL_POSITION_KEY]: '{oops' }) }) === null);
check('a half-written position is ignored',
  readPanelPosition({ localStorage: memoryStorage({ [PANEL_POSITION_KEY]: '{"left":10}' }) }) === null);
check('storage failures never throw', (() => {
  const broken = { localStorage: { getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } } };
  return readPanelPosition(broken) === null && writePanelPosition(broken, { left: 1, top: 1 }) === false
    && clearPanelPosition(broken) === false;
})());

console.log('\n8) config CLI (scripts/nav.mjs)');
const sandbox = mkdtempSync(join(tmpdir(), 'nav-cli-'));
const sandboxConfig = join(sandbox, 'nav-config.json');
const sandboxClient = join(sandbox, 'client.js');
copyFileSync(join(here, 'nav-config.json'), sandboxConfig);
copyFileSync(join(here, 'client.js'), sandboxClient);
const nav = (...args) => execFileSync(process.execPath, [join(here, 'scripts', 'nav.mjs'), ...args,
  '--config', sandboxConfig, '--client', sandboxClient], { encoding: 'utf8' });
const readSandbox = () => JSON.parse(readFileSync(sandboxConfig, 'utf8'));
try {
  nav('assign', 'pet', 'ui');
  check('assign records the category', readSandbox().grouping.assign.pet === 'ui');
  nav('rename', 'dsh-usage', '用量统计');
  check('rename keeps the whole name', readSandbox().rename['dsh-usage'] === '用量统计',
    JSON.stringify(readSandbox().rename));
  nav('rename', 'pet', '萌 宠');
  check('rename keeps spaces inside the name', readSandbox().rename.pet === '萌 宠',
    JSON.stringify(readSandbox().rename));
  nav('official', 'workbuddy-ai');
  check('official adds to the promoted list', readSandbox().official.includes('workbuddy-ai'));
  nav('unofficial', 'workbuddy-ai');
  check('unofficial removes it', readSandbox().official.length === 0);
  nav('label', 'ui', '外观与界面');
  check('label renames the group caption', readSandbox().grouping.labels.ui === '外观与界面');
  nav('order', 'tools,ui');
  check('order rewrites group order', readSandbox().grouping.order.join(',') === 'tools,ui');
  nav('nav', 'off');
  check('nav switch turns the band split off', readSandbox().nav.banded === false);
  nav('nav', 'on');
  check('nav switch turns it back on', readSandbox().nav.banded === true);
  nav('position', 'dsh-usage', '1');
  check('position records a slot', readSandbox().position['dsh-usage'] === 1);
  nav('unposition', 'dsh-usage');
  check('unposition removes it', readSandbox().position['dsh-usage'] === undefined);
  nav('category', 'add', 'mine', '我的分组');
  check('category add appends to the order', readSandbox().grouping.order.includes('mine')
    && readSandbox().grouping.labels.mine === '我的分组');
  nav('assign', 'pet', 'mine');
  nav('category', 'remove', 'mine');
  check('category remove drops the order, label and assigns',
    !readSandbox().grouping.order.includes('mine')
    && readSandbox().grouping.labels.mine === undefined
    && readSandbox().grouping.assign.pet === undefined);
  nav('grouping', 'off');
  check('grouping can be toggled off', readSandbox().grouping.enabled === false);
  nav('grouping', 'on');
  check('grouping can be toggled back on', readSandbox().grouping.enabled === true);
  const baked = readFileSync(sandboxClient, 'utf8');
  check('every edit is baked into the client', baked.includes('外观与界面') && baked.includes('萌 宠'));
  execFileSync(process.execPath, [join(here, 'scripts', 'build-config.mjs'),
    '--check', '--config', sandboxConfig, '--client', sandboxClient], { encoding: 'utf8' });
  check('baked client passes --check', true);
  writeFileSync(sandboxConfig, JSON.stringify({ ...readSandbox(), rename: { pet: 'x' } }, null, 2));
  let drift = false;
  try {
    execFileSync(process.execPath, [join(here, 'scripts', 'build-config.mjs'),
      '--check', '--config', sandboxConfig, '--client', sandboxClient], { stdio: 'pipe' });
  } catch (error) {
    drift = true;
  }
  check('--check detects drift after a manual edit', drift);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

console.log('\n9) standalone panel');

/* Render a component tree to plain text markers for structural assertions. */
function tags(node, out = []) {
  if (node === null || node === undefined) return out;
  if (Array.isArray(node)) { node.forEach((child) => tags(child, out)); return; }
  if (typeof node !== 'object') return out;
  if (typeof node.type === 'function') { tags(node.type(node.props), out); return; }
  if (typeof node.type === 'string') out.push({ tag: node.type, props: node.props });
  const children = node.props && node.props.children;
  if (Array.isArray(children)) children.forEach((child) => tags(child, out));
  return out;
}
const textOf = (node) => {
  let text = '';
  const visit = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'string' || typeof value === 'number') { text += String(value); return; }
    if (typeof value !== 'object') return;
    if (typeof value.type === 'function') { visit(value.type(value.props)); return; }
    visit(value.props && value.props.children);
  };
  visit(node);
  return text;
};

const expectedPanelCount = planNav(FIXTURE, CONFIG).thirdPartyCount + planNav(FIXTURE, CONFIG).promotedCount;
const rows = panelRows(FIXTURE, CONFIG);
check('panel lists only plugin-provided entries', rows.length === expectedPanelCount, String(rows.length));
check('panel rows carry the package name', rows.every((row) => typeof row.package === 'string'));
check('shipped entries are excluded', rows.every((row) => row.id !== 'general' && row.id !== 'agent-presets'));
check('rename reaches the panel', panelRows(FIXTURE, mergeConfig(CONFIG, { rename: { pet: '萌宠' } }))
  .find((row) => row.id === 'pet').name === '萌宠');
check('promoted entries stay listed', panelRows(FIXTURE, mergeConfig(CONFIG, { official: ['pet'] }))
  .find((row) => row.id === 'pet').promoted === true);

const groups = panelGroups(rows, CONFIG, t);
check('panel groups follow the configured order', (() => {
  const declared = CONFIG.grouping.order;
  const ranks = groups.map((g) => declared.indexOf(g.category));
  return ranks.every((value, index) => index === 0 || ranks[index - 1] <= value);
})(), groups.map((g) => g.category).join(','));
check('panel group counts add up',
  groups.reduce((sum, g) => sum + g.rows.length, 0) === rows.length);
check('panel group labels are localized',
  groups.every((g) => typeof g.label === 'string' && g.label.length > 0));
check('empty categories are omitted', groups.every((g) => g.rows.length > 0));

check('filter matches the display name', filterPanelRows(rows, '萌宠').length === 0
  && filterPanelRows(panelRows(FIXTURE, mergeConfig(CONFIG, { rename: { pet: '萌宠' } })), '萌宠').length === 1);
check('filter matches the package', filterPanelRows(rows, 'linxin666').length > 0);
check('filter matches the section id', filterPanelRows(rows, 'plugin-settings').length === 1);
check('empty query keeps every row', filterPanelRows(rows, '   ').length === rows.length);
check('no match returns nothing', filterPanelRows(rows, 'zzz-nothing').length === 0);

check('panel css has enter animations',
  PANEL_CSS.includes('@keyframes po-rise') && PANEL_CSS.includes('@keyframes po-fade')
  && PANEL_CSS.includes('@keyframes po-card'));
check('panel css staggers cards', PANEL_CSS.includes('animation-delay:calc(var(--po-i,0) * 26ms)'));
check('panel css animates disclosure', PANEL_CSS.includes('grid-template-rows 220ms'));
check('panel css honours prefers-reduced-motion', PANEL_CSS.includes('@media (prefers-reduced-motion: reduce)'));
check('panel css falls back when a token is missing',
  PANEL_CSS.includes('var(--dsw-alias-bg-layer-2,#1b1b1e)')
  && PANEL_CSS.includes('var(--dsw-alias-label-primary,#f2f2f3)'));
check('panel css never targets a host class name',
  !/navCell|navList|VOzbGW|data-shortcut-modal/.test(PANEL_CSS),
  (PANEL_CSS.match(/navCell|navList|VOzbGW|data-shortcut-modal/) || [''])[0]);

const closed = createOpenStore(false);
check('store starts closed and reports changes', (() => {
  let calls = 0;
  const off = closed.subscribe(() => { calls += 1; });
  closed.set(true);
  closed.set(true);
  off();
  closed.set(false);
  return calls === 1 && closed.get() === false;
})(), 'store emitted an unexpected number of times');

const panelProps = {
  t,
  store: createOpenStore(true),
  read: () => FIXTURE,
  config: () => CONFIG
};
check('panel renders nothing while closed', OrganizerPanel({ ...panelProps, store: createOpenStore(false) }) === null);
check('panel css animates its exit',
  PANEL_CSS.includes('@keyframes po-rise-out') && PANEL_CSS.includes('@keyframes po-fade-out')
  && PANEL_CSS.includes('.po-root[data-closing="true"] .po-panel'));
check('exit animation is disabled under reduced motion',
  PANEL_CSS.includes('.po-root[data-closing="true"] .po-mask,.po-root[data-closing="true"] .po-panel{animation:none!important}'));
check('closing root stops receiving pointer events',
  PANEL_CSS.includes('.po-root[data-closing="true"]{pointer-events:none}'));
const closingTree = OrganizerPanel({ ...panelProps, store: createOpenStore(true) });
check('open panel marks itself as not closing',
  closingTree.props['data-closing'] === 'false', String(closingTree.props['data-closing']));
const tree = OrganizerPanel(panelProps);
const nodes = tags(tree);
check('panel renders a modal dialog',
  nodes.some((n) => n.tag === 'div' && n.props.role === 'dialog' && n.props['aria-modal'] === 'true'));
check('panel is labelled by its title',
  nodes.some((n) => n.tag === 'h2' && n.props.id === 'po-panel-title'));
check('panel renders a search box',
  nodes.some((n) => n.tag === 'input' && n.props.type === 'search'));
check('panel renders one head per group',
  nodes.filter((n) => n.tag === 'section').length === groups.length);
check('panel renders one card per entry',
  nodes.filter((n) => n.tag === 'article').length === rows.length,
  String(nodes.filter((n) => n.tag === 'article').length));
check('cards receive their stagger index',
  nodes.filter((n) => n.tag === 'article').every((n) => typeof n.props.style['--po-i'] === 'string'));
check('panel shows the entry count', textOf(tree).includes(String(rows.length) + ' 项'));
check('panel hint tells where to click', textOf(tree).includes('设置'));

const triggerNodes = tags(PanelTrigger({ t, store: createOpenStore(false) }));
const triggerButtons = triggerNodes.filter((n) => n.tag === 'button');
check('trigger is a labelled button',
  triggerButtons.length === 1
  && triggerButtons[0].props['aria-label'] === '插件设置总览'
  && typeof triggerButtons[0].props.onClick === 'function',
  JSON.stringify(triggerNodes.map((n) => n.tag)));
check('trigger paints its own icon', triggerNodes.some((n) => n.tag === 'svg'));

const dragged = tags(OrganizerPanel({ ...panelProps, store: createOpenStore(true) }))
  .filter((n) => n.tag === 'div' && n.props.role === 'dialog')[0];
check('the dialog is centred until it is moved', dragged.props.style === undefined);
const head = tags(OrganizerPanel({ ...panelProps, store: createOpenStore(true) }))
  .filter((n) => n.tag === 'header')[0];
check('the header is the drag handle',
  typeof head.props.onPointerDown === 'function' && typeof head.props.onPointerMove === 'function'
  && typeof head.props.onPointerUp === 'function');
check('a recenter action exists',
  tags(OrganizerPanel({ ...panelProps, store: createOpenStore(true) }))
    .filter((n) => n.tag === 'button').some((n) => n.props.title === '复位位置'));


console.log('');
if (failures > 0) {
  console.log(String(failures) + ' assertion(s) failed');
  process.exit(1);
}
console.log('all assertions passed');
