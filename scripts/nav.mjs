#!/usr/bin/env node
/**
 * Edit nav-config.json without hand-writing JSON.
 *
 * Every command mutates the config and then bakes it into client.js, so one
 * command is enough: refresh the Web page afterwards.
 *
 *   node scripts/nav.mjs show
 *   node scripts/nav.mjs grouping on|off
 *   node scripts/nav.mjs nav on|off                       # in-navigation band split
 *   node scripts/nav.mjs position <section-id|package> <n>   # slot inside its band (1 = first)
 *   node scripts/nav.mjs unposition <section-id|package>
 *   node scripts/nav.mjs category add <id> <caption>        # new category
 *   node scripts/nav.mjs category remove <id>
 *   node scripts/nav.mjs assign <section-id|package> <category>
 *   node scripts/nav.mjs unassign <section-id|package>
 *   node scripts/nav.mjs rename <section-id|package> <display name>
 *   node scripts/nav.mjs unrename <section-id|package>
 *   node scripts/nav.mjs official <section-id|package>      # move above the divider
 *   node scripts/nav.mjs unofficial <section-id|package>
 *   node scripts/nav.mjs label <category> <caption>
 *   node scripts/nav.mjs order <cat,cat,...>
 *
 * Options: --config <path>  --client <path>  --no-bake
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
/*
 * Parse `--name value` flags and bare words separately: an option's value must
 * never leak into the positional arguments (it would become part of a name).
 */
const options = { noBake: false };
const positional = [];
{
  const raw = process.argv.slice(2);
  for (let i = 0; i < raw.length; i += 1) {
    const token = raw[i];
    if (token === '--no-bake') { options.noBake = true; continue; }
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const value = raw[i + 1];
      if (value === undefined) throw new Error('--' + name + ' needs a value');
      options[name] = value;
      i += 1;
      continue;
    }
    positional.push(token);
  }
}

const configPath = resolve(options.config ?? join(root, 'nav-config.json'));
const clientPath = resolve(options.client ?? join(root, 'client.js'));

/** Load, normalize, and remember the config. */
function load() {
  const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  parsed.grouping = parsed.grouping ?? {};
  parsed.grouping.order = Array.isArray(parsed.grouping.order) ? parsed.grouping.order : [];
  parsed.grouping.labels = parsed.grouping.labels ?? {};
  parsed.grouping.assign = parsed.grouping.assign ?? {};
  parsed.nav = parsed.nav ?? {};
  parsed.position = parsed.position ?? {};
  if (parsed.nav.banded === undefined) parsed.nav.banded = true;
  parsed.rename = parsed.rename ?? {};
  parsed.official = Array.isArray(parsed.official) ? parsed.official : [];
  return parsed;
}

/** Persist and bake, unless --no-bake was given. */
function save(config, baked) {
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  if (options.noBake) return;
  execFileSync(process.execPath, [join(root, 'scripts', 'build-config.mjs'),
    '--config', configPath, '--client', clientPath], { stdio: 'inherit' });
}

/** Ensure a category is declared so its group can be ordered and labeled. */
function ensureCategory(config, category) {
  if (config.grouping.order.indexOf(category) === -1) config.grouping.order.push(category);
  if (config.grouping.labels[category] === undefined) config.grouping.labels[category] = category;
}

/** Reject empty keys and values early, with a usable message. */
function need(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(label + ' is required');
  }
  return value.trim();
}

const [command, ...rest] = positional;
const config = load();
let changed = false;

switch (command) {
  case 'show': {
    console.log(JSON.stringify(config, null, 2));
    process.exit(0);
  }
  case 'grouping': {
    const value = need(rest[0], 'on|off');
    if (value !== 'on' && value !== 'off') throw new Error('grouping expects on or off');
    config.grouping.enabled = value === 'on';
    changed = true;
    console.log('grouping ' + value);
    break;
  }
  case 'nav': {
    const value = need(rest[0], 'on|off');
    if (value !== 'on' && value !== 'off') throw new Error('nav expects on or off');
    config.nav.banded = value === 'on';
    changed = true;
    console.log('navigation band split ' + value);
    break;
  }
  case 'position': {
    const key = need(rest[0], 'section id or package');
    const raw = need(rest[1], 'position');
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new Error('position must be a number');
    config.position[key] = value;
    changed = true;
    console.log(key + ' → position ' + value);
    break;
  }
  case 'unposition': {
    const key = need(rest[0], 'section id or package');
    delete config.position[key];
    changed = true;
    console.log(key + ' → natural position');
    break;
  }
  case 'category': {
    const action = need(rest[0], 'add|remove');
    const id = need(rest[1], 'category id');
    if (action === 'add') {
      const caption = rest.length > 2 ? need(rest.slice(2).join(' '), 'caption') : id;
      ensureCategory(config, id);
      config.grouping.labels[id] = caption;
      if (config.grouping.order.indexOf(id) === -1) config.grouping.order.push(id);
      console.log('category ' + id + ' → ' + caption);
    } else if (action === 'remove') {
      config.grouping.order = config.grouping.order.filter((item) => item !== id);
      delete config.grouping.labels[id];
      for (const key of Object.keys(config.grouping.assign)) {
        if (config.grouping.assign[key] === id) delete config.grouping.assign[key];
      }
      console.log('category ' + id + ' removed');
    } else {
      throw new Error('category expects add or remove');
    }
    changed = true;
    break;
  }
  case 'assign': {
    const key = need(rest[0], 'section id or package');
    const category = need(rest[1], 'category');
    config.grouping.assign[key] = category;
    ensureCategory(config, category);
    changed = true;
    console.log(key + ' → ' + category);
    break;
  }
  case 'unassign': {
    const key = need(rest[0], 'section id or package');
    delete config.grouping.assign[key];
    changed = true;
    console.log(key + ' → default category');
    break;
  }
  case 'rename': {
    const key = need(rest[0], 'section id or package');
    const name = need(rest.slice(1).join(' '), 'display name');
    config.rename[key] = name;
    changed = true;
    console.log(key + ' → ' + name);
    break;
  }
  case 'unrename': {
    const key = need(rest[0], 'section id or package');
    delete config.rename[key];
    changed = true;
    console.log(key + ' → original name');
    break;
  }
  case 'official': {
    const key = need(rest[0], 'section id or package');
    if (config.official.indexOf(key) === -1) config.official.push(key);
    changed = true;
    console.log(key + ' → treated as shipped');
    break;
  }
  case 'unofficial': {
    const key = need(rest[0], 'section id or package');
    config.official = config.official.filter((item) => item !== key);
    changed = true;
    console.log(key + ' → back to the plugin band');
    break;
  }
  case 'label': {
    const category = need(rest[0], 'category');
    const caption = need(rest.slice(1).join(' '), 'caption');
    ensureCategory(config, category);
    config.grouping.labels[category] = caption;
    changed = true;
    console.log(category + ' label → ' + caption);
    break;
  }
  case 'order': {
    const raw = need(rest[0], 'category list');
    const list = raw.split(',').map((item) => item.trim()).filter(Boolean);
    if (list.length === 0) throw new Error('order needs at least one category');
    config.grouping.order = list;
    list.forEach((category) => ensureCategory(config, category));
    config.grouping.order = list;
    changed = true;
    console.log('order → ' + list.join(', '));
    break;
  }
  default: {
    console.error('usage: node scripts/nav.mjs <show|nav|grouping|position|category|assign|unassign|rename|unrename|official|unofficial|label|order> [args]');
    process.exit(2);
  }
}

if (changed) save(config, true);
