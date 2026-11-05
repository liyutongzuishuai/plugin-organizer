window.__ModuleLoader__.load({
  // Must equal package.json `name`: the browser module loader keys factories by it.
  id: 'dsh-plugin-organizer',
  factory() {
    const NS = 'pluginOrganizer';

    /** Services: the slot ledger (nav rows) and the locale dictionaries. */
    const inject = ['slots', 'locale'];

    /** Sections the dsh installation itself ships (fallback when no registrant stamp). */
    const SHIPPED_SECTION_IDS = ['account', 'general', 'models', 'plugins', 'agent-presets'];

    /** localStorage key for a live override of nav-config.json. */
    const STORAGE_KEY = 'dsh-plugin-organizer:config';

    /* BAKED-CONFIG-START */
    const CONFIG = {
      "$schema": "dsh-plugin-organizer/nav-config@1",
      "grouping": {
        "enabled": true,
        "order": [
          "ui",
          "settings",
          "sidebar",
          "session",
          "tools",
          "llm",
          "exec",
          "storage",
          "api",
          "host",
          "experimental",
          "other"
        ],
        "labels": {
          "ui": "界面",
          "settings": "设置页",
          "sidebar": "侧栏",
          "session": "会话",
          "tools": "工具",
          "llm": "模型",
          "exec": "执行",
          "storage": "存储",
          "api": "接口",
          "host": "宿主",
          "experimental": "实验",
          "other": "其他"
        },
        "assign": {}
      },
      "rename": {},
      "official": []
    };
    /* BAKED-CONFIG-END */

    /** Category keyword rules, evaluated in order; the first hit wins. */
    const CATEGORY_RULES = [
      ['experimental', ['experimental', 'workshop']],
      ['settings', ['settings', 'config-editor']],
      ['sidebar', ['sidebar', 'panellist']],
      ['ui', ['client-ui', 'ui-', 'theme', 'locale', 'conversation', 'chat', 'composer', 'skin', 'palette']],
      ['llm', ['llm', 'model', 'credential', 'account', 'token-meter', 'provider', 'vision', 'usage']],
      ['storage', ['storage', 'persistence', 'session-format', 'spill', 'atomic-write', 'projection', 'chunked-list', 'output-retention']],
      ['exec', ['sandbox', 'subprocess', 'pwsh', 'permission']],
      ['api', ['api-', 'gateway', 'remote', 'typert', 'im-', 'dingtalk', 'connect']],
      ['tools', ['tool-', 'tools', 'bash', 'web-', 'search', 'fetch', 'terminal', 'mcp']],
      ['session', ['session', 'agent', 'compaction', 'workflow', 'subagent', 'skill', 'goal', 'todo', 'plan']],
      // Only the shipped scope reaches `host`; a third-party package such as
      // `@linxin666/dsh-pet` must not be swallowed by the `dsh-` prefix.
      ['host', ['@deepseek-ai/']]
    ];

    /** Read one ledger entry's options (the slot service stores them under `options`). */
    function optionsOf(entry) {
      if (entry === undefined || entry === null || typeof entry !== 'object') return {};
      const options = entry.options;
      if (options !== undefined && options !== null && typeof options === 'object') return options;
      return entry;
    }

    /** Whether a registration came from a plugin the user installed. */
    function isThirdParty(entry) {
      const options = optionsOf(entry);
      const registrant = options.registrant;
      if (typeof registrant === 'string' && registrant.length > 0) {
        return registrant.indexOf('@deepseek-ai/') !== 0;
      }
      return SHIPPED_SECTION_IDS.indexOf(options.id) === -1;
    }

    /** First config value matching either the section id or the registrant package. */
    function lookup(map, id, registrant) {
      if (map === undefined || map === null || typeof map !== 'object') return undefined;
      if (id !== undefined && Object.prototype.hasOwnProperty.call(map, id)) return map[id];
      if (registrant !== undefined && Object.prototype.hasOwnProperty.call(map, registrant)) return map[registrant];
      return undefined;
    }

    /** Category id for one row: explicit assignment first, then the keyword rules. */
    function categoryOf(id, registrant, config) {
      const grouping = (config && config.grouping) || {};
      const assigned = lookup(grouping.assign, id, registrant);
      if (typeof assigned === 'string' && assigned.length > 0) return assigned;
      const haystack = String(id === undefined ? '' : id).toLowerCase()
        + ' '
        + String(registrant === undefined ? '' : registrant).toLowerCase();
      for (let i = 0; i < CATEGORY_RULES.length; i += 1) {
        const category = CATEGORY_RULES[i][0];
        const keywords = CATEGORY_RULES[i][1];
        for (let j = 0; j < keywords.length; j += 1) {
          if (haystack.indexOf(keywords[j]) !== -1) return category;
        }
      }
      return 'other';
    }

    /** Overlay a stored override on the baked config, one level deep per section. */
    function mergeConfig(base, override) {
      const safe = override === undefined || override === null ? {} : override;
      return {
        grouping: Object.assign({}, base.grouping, safe.grouping),
        rename: Object.assign({}, base.rename, safe.rename),
        official: Array.isArray(safe.official) ? safe.official : base.official
      };
    }

    /** Effective config: the baked literal, optionally overlaid by localStorage. */
    function readConfig(view) {
      const base = mergeConfig(CONFIG, {});
      try {
        const scope = view === undefined ? globalThis : view;
        const storage = scope === null || scope === undefined ? undefined : scope.localStorage;
        const raw = storage === undefined ? null : storage.getItem(STORAGE_KEY);
        if (typeof raw === 'string' && raw.length > 0) return mergeConfig(base, JSON.parse(raw));
      } catch (error) {
        /* A malformed override must never break the settings panel. */
      }
      return base;
    }

    /**
     * Project ledger entries into the nav plan.
     * Rows keep the shell's registration order inside their band; grouping only
     * decides the CSS `order` each row receives, so nothing moves in the DOM.
     * @param entries - live `settings.section` entries.
     * @param config - effective config.
     * @returns plan with band and group membership, plus renames per row.
     */
    function planNav(entries, config) {
      const cfg = config === undefined ? CONFIG : config;
      const grouping = cfg.grouping || {};
      const official = Array.isArray(cfg.official) ? cfg.official : [];
      const list = Array.isArray(entries) ? entries : [];
      const rows = [];
      for (let i = 0; i < list.length; i += 1) {
        const options = optionsOf(list[i]);
        const id = options.id;
        const registrant = options.registrant;
        const listed = (id !== undefined && official.indexOf(id) !== -1)
          || (registrant !== undefined && official.indexOf(registrant) !== -1);
        const thirdParty = isThirdParty(list[i]) && !listed;
        rows.push({
          id: id,
          registrant: registrant,
          order: typeof options.order === 'number' ? options.order : 0,
          registeredAt: i,
          thirdParty: thirdParty,
          promoted: listed && isThirdParty(list[i]),
          category: categoryOf(id, registrant, cfg),
          rename: lookup(cfg.rename, id, registrant)
        });
      }
      rows.sort((a, b) => (a.order - b.order) || (a.registeredAt - b.registeredAt));

      const declared = Array.isArray(grouping.order) && grouping.order.length > 0
        ? grouping.order
        : ['other'];
      const rank = new Map();
      for (let i = 0; i < declared.length; i += 1) rank.set(declared[i], i);

      const groups = [];
      const byCategory = new Map();
      const bandPositions = [];
      let firstThirdPartyPosition = 0;
      let thirdPartyCount = 0;
      let promotedCount = 0;
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const position = i + 1;
        if (!row.thirdParty) {
          bandPositions.push(position);
          if (row.promoted) promotedCount += 1;
          continue;
        }
        thirdPartyCount += 1;
        if (firstThirdPartyPosition === 0) firstThirdPartyPosition = position;
        if (!byCategory.has(row.category)) {
          const group = {
            category: row.category,
            rank: rank.has(row.category) ? rank.get(row.category) : declared.length + 1,
            positions: [],
            firstPosition: 0
          };
          byCategory.set(row.category, group);
          groups.push(group);
        }
        const group = byCategory.get(row.category);
        group.positions.push(position);
        if (group.firstPosition === 0) group.firstPosition = position;
      }
      groups.sort((a, b) => a.rank - b.rank);
      for (let i = 0; i < groups.length; i += 1) {
        groups[i].visualOrder = 100 + i * 10;
      }
      return {
        rows: rows,
        bandPositions: bandPositions,
        groups: groups,
        firstThirdPartyPosition: firstThirdPartyPosition,
        thirdPartyCount: thirdPartyCount,
        promotedCount: promotedCount,
        groupingEnabled: grouping.enabled !== false
      };
    }

    /** Escape one CSS string literal body. */
    function cssString(value) {
      return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
    }

    /** Caption pseudo-element body shared by the band header and group labels. */
    function captionRule(selector, text, top) {
      return selector + '::before{content:"' + cssString(text) + '"'
        + ';position:absolute;left:12px;top:' + top + ';right:12px'
        + ';color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;letter-spacing:0.02em'
        + ';white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none}';
    }

    /**
     * Build the stylesheet for one plan.
     *
     * Ordering is flex `order` on the nav list's children; captions and renames
     * are pseudo-elements on the affected row, because Chromium ignores `order`
     * on a flex container's generated `::after`.
     *
     * @param plan - result of {@link planNav}.
     * @param headerLabel - band caption, already localized and counted.
     * @param labels - category id to display label.
     * @returns CSS text; empty when there is nothing to organize.
     */
    function buildCss(plan, headerLabel, labels) {
      if (plan === undefined || plan.thirdPartyCount === 0) return '';
      const list = '[data-shortcut-modal="settings"] [class*="navList"]';
      const children = list + '>*';
      const at = (position) => children + ':nth-child(' + String(position) + ')';
      const rules = [children + '{order:1}'];

      for (let i = 0; i < plan.groups.length; i += 1) {
        const group = plan.groups[i];
        rules.push(group.positions.map(at).join(',') + '{order:' + String(group.visualOrder) + '}');
      }

      // The band header belongs to the FIRST VISUAL group's first row. Using the
      // first third-party row in DOM order would collide with that row's own
      // group caption whenever visual grouping reorders it (the later rule wins).
      const headerRow = at(plan.groups[0].firstPosition);
      rules.push(headerRow + '{margin-top:34px;border-top:0.5px solid var(--dsw-alias-border-l2);position:relative}');
      rules.push(captionRule(headerRow, headerLabel, '-20px'));

      if (plan.groupingEnabled && plan.groups.length > 1) {
        for (let i = 1; i < plan.groups.length; i += 1) {
          const group = plan.groups[i];
          const row = at(group.firstPosition);
          const label = (labels && labels[group.category]) || group.category;
          rules.push(row + '{margin-top:26px;position:relative}');
          rules.push(captionRule(row, label, '-16px'));
        }
      }

      for (let i = 0; i < plan.rows.length; i += 1) {
        const row = plan.rows[i];
        if (typeof row.rename !== 'string' || row.rename.length === 0) continue;
        const selector = at(i + 1);
        // Hide the shell's own label and draw the replacement in its place.
        rules.push(selector + ' [class*="navLabel"]{display:none}');
        rules.push(selector + '::after{content:"' + cssString(row.rename) + '"'
          + ';flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'
          + ';font-size:14px;line-height:22px;color:inherit}');
      }
      return rules.join('\n');
    }

    /** Dictionaries: the band caption and the fallback category labels. */
    const zh = {
      navGroup: '插件提供',
      navGroupCount: '插件提供 · {count}',
      catUi: '界面', catSettings: '设置页', catSidebar: '侧栏', catSession: '会话',
      catTools: '工具', catLlm: '模型', catExec: '执行', catStorage: '存储',
      catApi: '接口', catHost: '宿主', catExperimental: '实验', catOther: '其他'
    };
    const en = {
      navGroup: 'From plugins',
      navGroupCount: 'From plugins · {count}',
      catUi: 'Interface', catSettings: 'Settings', catSidebar: 'Sidebar', catSession: 'Sessions',
      catTools: 'Tools', catLlm: 'Models', catExec: 'Execution', catStorage: 'Storage',
      catApi: 'API', catHost: 'Host', catExperimental: 'Experimental', catOther: 'Other'
    };

    /** Category caption for one id, preferring the config's own labels. */
    function categoryLabel(category, config, t) {
      const grouping = (config && config.grouping) || {};
      const labels = grouping.labels;
      const custom = labels === undefined || labels === null ? undefined : labels[category];
      if (typeof custom === 'string' && custom.length > 0) return custom;
      const key = 'cat' + String(category).charAt(0).toUpperCase() + String(category).slice(1);
      const text = t(key);
      return typeof text === 'string' && text !== key ? text : String(category);
    }

    /** Keep the settings navigation banded, grouped, and renamed as configured. */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }),
        'plugin-organizer: dictionaries');
      const t = ctx.locale.bind(NS);
      const read = () => {
        const slots = ctx.slots;
        if (slots === undefined) return [];
        const entries = slots.entries('settings.section');
        return Array.isArray(entries) ? entries : [];
      };
      const styles = [];
      const render = (style) => {
        const config = readConfig(globalThis);
        const plan = planNav(read(), config);
        const template = t('navGroupCount');
        const counted = typeof template === 'string' && template.indexOf('{count}') !== -1
          ? String(template).split('{count}').join(String(plan.thirdPartyCount))
          : t('navGroup');
        const labels = {};
        for (let i = 0; i < plan.groups.length; i += 1) {
          const category = plan.groups[i].category;
          labels[category] = categoryLabel(category, config, t);
        }
        style.textContent = buildCss(plan, counted, labels);
        return plan;
      };

      const reload = () => {
        styles[styles.length - 1].textContent = '';
        const style = styles[styles.length - 1];
        return render(style);
      };

      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin-organizer', 'nav-groups');
        document.head.appendChild(style);
        styles.push(style);
        const rebuild = () => { render(style); };
        rebuild();
        const offSlot = typeof ctx.slots.subscribe === 'function'
          ? ctx.slots.subscribe('settings.section', rebuild)
          : () => {};
        const offLocale = typeof ctx.locale.subscribe === 'function'
          ? ctx.locale.subscribe(rebuild)
          : () => {};
        const settle = [setTimeout(rebuild, 0), setTimeout(rebuild, 400)];
        return () => {
          offSlot();
          offLocale();
          settle.forEach((id) => clearTimeout(id));
          if (style.parentNode) style.parentNode.removeChild(style);
        };
      }, 'plugin-organizer: settings nav groups');

      return { reload: reload };
    }

    return {
      inject: inject,
      apply: apply,
      /** Pure helpers, exposed for this bundle's own tests. */
      __internals: {
        CONFIG: CONFIG,
        STORAGE_KEY: STORAGE_KEY,
        optionsOf: optionsOf,
        isThirdParty: isThirdParty,
        categoryOf: categoryOf,
        mergeConfig: mergeConfig,
        readConfig: readConfig,
        planNav: planNav,
        buildCss: buildCss,
        categoryLabel: categoryLabel,
        dictionaries: { zh: zh, en: en },
        SHIPPED_SECTION_IDS: SHIPPED_SECTION_IDS
      }
    };
  }
});
