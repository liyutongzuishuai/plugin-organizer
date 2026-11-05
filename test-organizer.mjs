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
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      if (spec.id !== packageName) {
        throw new Error('browser module id must equal package.json name: ' + spec.id + ' != ' + packageName);
      }
      registered = spec.factory();
    }
  }
};

new Function('window', 'document', source)(globalThis.window, documentShim);
if (registered === null) throw new Error('bundle registered nothing');
const {
  CONFIG, mergeConfig, readConfig, planNav, buildCss, categoryOf,
  categoryLabel, dictionaries
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
check('first plugin row anchors the divider', plan.firstThirdPartyPosition === 5);
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
check('group visual orders rise by ten',
  plan.groups.every((g, index) => g.visualOrder === 100 + index * 10));
const labels = {};
plan.groups.forEach((g) => { labels[g.category] = categoryLabel(g.category, CONFIG, t); });
const groupedCss = buildCss(plan, '插件提供 · 10', labels);
check('every group is banded by order',
  plan.groups.every((g) => groupedCss.includes('{order:' + g.visualOrder + '}')));
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

console.log('\n5) treat a plugin entry as shipped');
const promoting = mergeConfig(CONFIG, { official: ['workbuddy-ai'] });
const promoted = planNav(FIXTURE, promoting);
const workbuddy = promoted.rows.find((r) => r.id === 'workbuddy-ai');
check('promoted row leaves the plugin band', workbuddy.thirdParty === false && workbuddy.promoted === true);
check('plugin count drops by one', promoted.thirdPartyCount === 9, String(promoted.thirdPartyCount));
check('band count grows by one', promoted.bandPositions.length === 6, String(promoted.bandPositions.length));
const promotedCss = buildCss(promoted, '插件提供 · 9', {});
check('promoted row is never banded in the sheet',
  !promotedCss.includes(':nth-child(5){order:'), promotedCss.split('\n')[1]);
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
const ctx = {
  effect(fn, label) { effects.push(label); return fn(); },
  locale: {
    register(ns, dicts) { this.registered = { ns, dicts }; },
    bind: () => t,
    subscribe: (fn) => { localeSubs.push(fn); return () => {}; }
  },
  slots: {
    entries: (key) => (key === 'settings.section' ? FIXTURE : []),
    subscribe: (key, fn) => { slotSubs.push({ key, fn }); return () => {}; }
  }
};
const api = registered.apply(ctx);
check('registers dictionaries', ctx.locale.registered.dicts.zh.navGroup === '插件提供');
check('style element appended once', appends.length === 1, String(appends.length));
check('stylesheet written on mount', appends[0].textContent.includes('插件提供 · 10'));
check('subscribes to the ledger', slotSubs.length === 1 && slotSubs[0].key === 'settings.section');
check('two effects installed', effects.length === 2, String(effects.length));
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

console.log('');
if (failures > 0) {
  console.log(String(failures) + ' assertion(s) failed');
  process.exit(1);
}
console.log('all assertions passed');
