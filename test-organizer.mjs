/**
 * Offline test for the settings-navigation organizer.
 * Uses the real ledger entry shape (`{ options: {...} }`) that the settings
 * shell projects, and checks the generated stylesheet against the browser
 * behaviour measured in the local reproduction (flex `order` reorders rows;
 * `order` on a container's `::after` is ignored by Chromium).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'client.js'), 'utf8');

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
      if (spec.id !== '@local/plugin-organizer') throw new Error('unexpected id: ' + spec.id);
      registered = spec.factory();
    }
  }
};

new Function('window', 'document', source)(globalThis.window, documentShim);
if (registered === null) throw new Error('bundle registered nothing');
const { isThirdParty, planNav, buildCss, optionsOf, dictionaries } = registered.__internals;
const t = (key) => (dictionaries.zh[key] === undefined ? key : dictionaries.zh[key]);

let failures = 0;
function check(label, condition, detail) {
  if (condition) console.log('  ok   ' + label);
  else {
    failures += 1;
    console.log('  FAIL ' + label + (detail === undefined ? '' : ' -> ' + detail));
  }
}

/* Real section orders of this deployment, in the slot service's entry shape. */
const row = (id, order, registrant) => ({ options: { id, order, registrant } });
const SECTION_FIXTURE = [
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

console.log('\n1) entry shape and origin split');
check('reads the real options wrapper', optionsOf(SECTION_FIXTURE[0]).id === 'account');
check('accepts a bare options object', optionsOf({ id: 'x' }).id === 'x');
check('shipped package is not third-party', isThirdParty(SECTION_FIXTURE[2]) === false);
check('installed package is third-party', isThirdParty(SECTION_FIXTURE[11]) === true);
check('bare-name installed package is third-party', isThirdParty(SECTION_FIXTURE[14]) === true);
check('missing registrant falls back to the shipped id list',
  isThirdParty({ options: { id: 'agent-presets' } }) === false
  && isThirdParty({ options: { id: 'pet' } }) === true);

console.log('\n2) nav plan against the real orders');
const plan = planNav(SECTION_FIXTURE);
check('15 rows planned', plan.rows.length === 15);
check('5 shipped rows', plan.builtInCount === 5, String(plan.builtInCount));
check('10 plugin rows', plan.pluginCount === 10, String(plan.pluginCount));
check('shipped rows keep their registration order',
  plan.rows.filter((r) => !r.thirdParty).map((r) => r.id).join(',') === 'account,general,models,plugins,agent-presets',
  plan.rows.filter((r) => !r.thirdParty).map((r) => r.id).join(','));
check('plugin positions are 1-based nth-child values',
  JSON.stringify(plan.pluginPositions) === JSON.stringify([5, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
  JSON.stringify(plan.pluginPositions));
check('first plugin row is the divider anchor', plan.firstPluginPosition === 5);
check('no row is lost', plan.rows.length === SECTION_FIXTURE.length);

/* Simulate the browser: flex items sort by `order`, ties keep DOM order. */
const pluginSet = new Set(plan.pluginPositions);
const visual = plan.rows
  .map((rowPlan, index) => ({
    id: rowPlan.id,
    band: pluginSet.has(index + 1) ? 2 : 1,
    position: index + 1
  }))
  .sort((a, b) => (a.band - b.band) || (a.position - b.position));
check('band 1 is exactly the five shipped rows, in order',
  visual.filter((r) => r.band === 1).map((r) => r.id).join(',')
    === 'account,general,models,plugins,agent-presets',
  visual.filter((r) => r.band === 1).map((r) => r.id).join(','));
check('band 2 is exactly the ten plugin rows, in order',
  visual.filter((r) => r.band === 2).map((r) => r.id).join(',')
    === 'workbuddy-ai,archived-sessions,dshp-vision-bridge,im-assistant,web-ui-plugins,skin-center,pet,market,dsh-usage,plugin-settings',
  visual.filter((r) => r.band === 2).map((r) => r.id).join(','));
check('every shipped row is above every plugin row',
  visual.slice(0, 5).every((r) => r.band === 1) && visual.slice(5).every((r) => r.band === 2));

console.log('\n3) generated stylesheet');
const css = buildCss(plan, '插件提供 · 10');
const prefix = '[data-shortcut-modal="settings"] [class*="navList"]>*';
check('scoped to the settings dialog', css.startsWith(prefix + '{order:1}'), css.split('\n')[0]);
check('every plugin position is banded',
  plan.pluginPositions.every((position) => css.includes(':nth-child(' + position + ')')),
  css.split('\n')[1]);
check('the band rule covers the whole plugin set',
  /:nth-child\(5\)[\s\S]*:nth-child\(15\)\{order:2\}/.test(css));
check('shipped rows are never banded', !/:nth-child\(6\)/.test(css));
check('divider rides the first plugin row',
  css.includes(':nth-child(5){margin-top:34px;border-top:0.5px solid var(--dsw-alias-border-l2);position:relative}'));
check('divider caption sits above that row',
  /:nth-child\(5\)::before\{content:"插件提供 · 10";position:absolute;left:12px;top:-20px/.test(css));
check('no container ::after is used (its order is ignored)',
  !/[class*="navList"]::after/.test(css) && !/[class*="navList"]>button/.test(css));
check('hairline and caption use theme tokens',
  css.includes('var(--dsw-alias-border-l2)') && css.includes('var(--dsw-alias-label-tertiary)'));
check('caption escaping keeps the CSS valid',
  buildCss(plan, 'a"b\\c').includes('content:"a\\"b\\\\c"'));
check('nothing to split means no rules', buildCss(planNav([SECTION_FIXTURE[0]]), 'x') === '');

console.log('\n4) live wiring');
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
    entries: (key) => (key === 'settings.section' ? SECTION_FIXTURE : []),
    subscribe: (key, fn) => { slotSubs.push({ key, fn }); return () => {}; }
  }
};
registered.apply(ctx);
check('registers its dictionaries',
  ctx.locale.registered !== undefined
  && ctx.locale.registered.ns === 'pluginOrganizer'
  && ctx.locale.registered.dicts.zh.navGroup === '插件提供');
check('two effects installed (dictionary + styles)', effects.length === 2, String(effects.length));
check('style element appended', appends.length === 1);
check('stylesheet written on mount',
  appends[0].textContent.includes('插件提供 · 10'), appends[0].textContent.slice(0, 60));
check('subscribes to the section ledger',
  slotSubs.length === 1 && slotSubs[0].key === 'settings.section');
check('subscribes to the locale revision', localeSubs.length === 1);
check('zh and en share one key set',
  JSON.stringify(Object.keys(dictionaries.zh).sort()) === JSON.stringify(Object.keys(dictionaries.en).sort()));

SECTION_FIXTURE.push(row('new-plugin', 160, '@someone/dsh-thing'));
slotSubs[0].fn();
check('a newly installed plugin re-plans the stylesheet',
  appends[0].textContent.includes('插件提供 · 11')
  && appends[0].textContent.includes(':nth-child(16)'),
  appends[0].textContent.split('\n')[1].slice(0, 100));

console.log('');
if (failures > 0) {
  console.log(String(failures) + ' assertion(s) failed');
  process.exit(1);
}
console.log('all assertions passed');
