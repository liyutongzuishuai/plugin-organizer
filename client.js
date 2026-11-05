window.__ModuleLoader__.load({
  // Must equal package.json `name`: the browser module loader keys factories by it.
  id: 'dsh-plugin-organizer',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'pluginOrganizer';

    /** Services: the slot ledger (nav rows) and the locale dictionaries. */
    const inject = ['slots', 'locale'];

    /** Sections the dsh installation itself ships (fallback when no registrant stamp). */
    const SHIPPED_SECTION_IDS = ['account', 'general', 'models', 'plugins', 'agent-presets'];

    /** localStorage key for a live override of nav-config.json. */
    const STORAGE_KEY = 'dsh-plugin-organizer:config';
    /** Separate key: the remembered panel position is view state, not config. */
    const PANEL_POSITION_KEY = 'dsh-plugin-organizer:panel-position';

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
      "official": [],
      "nav": {
        "banded": true
      },
      "position": {}
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
        nav: Object.assign({}, base.nav, safe.nav),
        position: Object.assign({}, base.position, safe.position),
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

    /** Explicit per-entry position, or undefined when the entry keeps its natural slot. */
    function positionOf(config, id, registrant) {
      const raw = lookup(config === undefined ? undefined : config.position, id, registrant);
      const value = typeof raw === 'string' ? Number(raw) : raw;
      return typeof value === 'number' && isFinite(value) ? value : undefined;
    }

    /** Move one id inside an ordered list, clamping the target index. */
    function reorderIds(ids, id, targetIndex) {
      const from = ids.indexOf(id);
      if (from === -1) return ids.slice();
      const next = ids.slice();
      next.splice(from, 1);
      const clamped = Math.max(0, Math.min(Math.round(targetIndex), next.length));
      next.splice(clamped, 0, id);
      return next;
    }

    /** Explicit positions (1-based) for an ordered id list. */
    function positionsForOrder(ids) {
      const out = {};
      for (let i = 0; i < ids.length; i += 1) out[ids[i]] = i + 1;
      return out;
    }

    /**
     * Which gap a pointer is over, given each card's vertical centre.
     * @param centres - card centre Y values, top to bottom.
     * @param clientY - pointer Y.
     * @returns insertion index in [0, centres.length].
     */
    function dropIndexAt(centres, clientY) {
      let index = 0;
      for (let i = 0; i < centres.length; i += 1) {
        if (clientY > centres[i]) index = i + 1;
      }
      return index;
    }

    /** Read the stored override object, tolerating a malformed value. */
    function readOverride(view) {
      try {
        const scope = view === undefined ? globalThis : view;
        const storage = scope === null || scope === undefined ? undefined : scope.localStorage;
        const raw = storage === undefined ? null : storage.getItem(STORAGE_KEY);
        if (typeof raw !== 'string' || raw.length === 0) return {};
        const parsed = JSON.parse(raw);
        return parsed !== null && typeof parsed === 'object' ? parsed : {};
      } catch (error) {
        return {};
      }
    }

    /** Merge position overrides into the stored override and persist them. */
    function writePositionOverride(view, positions) {
      try {
        const scope = view === undefined ? globalThis : view;
        const storage = scope === null || scope === undefined ? undefined : scope.localStorage;
        if (storage === undefined) return false;
        const current = readOverride(scope);
        const merged = Object.assign({}, current.position, positions);
        const next = Object.assign({}, current, { position: merged });
        storage.setItem(STORAGE_KEY, JSON.stringify(next));
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Keep a dragged panel on screen, with an 8px breathing edge. */
    function clampPanelPosition(position, size, viewport) {
      const edge = 8;
      const maxLeft = Math.max(edge, (viewport.width || 0) - (size.width || 0) - edge);
      const maxTop = Math.max(edge, (viewport.height || 0) - (size.height || 0) - edge);
      const left = Math.min(Math.max(edge, Number(position.left) || 0), maxLeft);
      const top = Math.min(Math.max(edge, Number(position.top) || 0), maxTop);
      return { left: left, top: top };
    }

    /** Read the remembered panel position, or null when none (or malformed). */
    function readPanelPosition(view) {
      try {
        const scope = view === undefined ? globalThis : view;
        const storage = scope === null || scope === undefined ? undefined : scope.localStorage;
        const raw = storage === undefined ? null : storage.getItem(PANEL_POSITION_KEY);
        if (typeof raw !== 'string' || raw.length === 0) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.left !== 'number' || typeof parsed.top !== 'number') return null;
        if (!isFinite(parsed.left) || !isFinite(parsed.top)) return null;
        return { left: parsed.left, top: parsed.top };
      } catch (error) {
        return null;
      }
    }

    /** Remember the panel position; a failure here must never break the panel. */
    function writePanelPosition(view, position) {
      try {
        const scope = view === undefined ? globalThis : view;
        const storage = scope === null || scope === undefined ? undefined : scope.localStorage;
        if (storage === undefined) return false;
        storage.setItem(PANEL_POSITION_KEY, JSON.stringify({ left: position.left, top: position.top }));
        return true;
      } catch (error) {
        return false;
      }
    }

    /** Forget the remembered position so the panel recentres. */
    function clearPanelPosition(view) {
      try {
        const scope = view === undefined ? globalThis : view;
        const storage = scope === null || scope === undefined ? undefined : scope.localStorage;
        if (storage !== undefined) storage.removeItem(PANEL_POSITION_KEY);
        return true;
      } catch (error) {
        return false;
      }
    }

    /**
     * Project ledger entries into the nav plan.
     *
     * Two orders are computed. The first is the DOM order the shell renders:
     * a stable sort by registration `order`, which fixes every row's
     * `nth-child` position. The second is the visual order this plugin asks
     * for: official rows first, then each configured category, with an
     * explicit `position` value winning inside each band and registration
     * order breaking ties. Every row receives the CSS `order` that lands it on
     * its visual index, so nothing has to move in the DOM.
     *
     * @param entries - live `settings.section` entries.
     * @param config - effective config.
     * @returns plan with DOM positions, visual order, and group membership.
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
          rename: lookup(cfg.rename, id, registrant),
          explicitPosition: positionOf(cfg, id, registrant),
          domPosition: 0,
          visualOrder: 0
        });
      }
      rows.sort((a, b) => (a.order - b.order) || (a.registeredAt - b.registeredAt));
      for (let i = 0; i < rows.length; i += 1) rows[i].domPosition = i + 1;

      const byExplicit = (a, b) => {
        const left = a.explicitPosition === undefined ? Number.POSITIVE_INFINITY : a.explicitPosition;
        const right = b.explicitPosition === undefined ? Number.POSITIVE_INFINITY : b.explicitPosition;
        return (left - right) || (a.registeredAt - b.registeredAt);
      };

      const band = rows.filter((row) => !row.thirdParty).sort(byExplicit);

      const declared = Array.isArray(grouping.order) && grouping.order.length > 0
        ? grouping.order
        : ['other'];
      const rank = new Map();
      for (let i = 0; i < declared.length; i += 1) rank.set(declared[i], i);
      const byCategory = new Map();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!row.thirdParty) continue;
        if (!byCategory.has(row.category)) byCategory.set(row.category, []);
        byCategory.get(row.category).push(row);
      }
      const groups = [];
      byCategory.forEach((categoryRows, category) => {
        groups.push({
          category: category,
          rank: rank.has(category) ? rank.get(category) : declared.length + 1,
          rows: categoryRows.slice().sort(byExplicit),
          domPositions: categoryRows.map((row) => row.domPosition)
        });
      });
      groups.sort((a, b) => a.rank - b.rank);

      const sequence = band.slice();
      for (let i = 0; i < groups.length; i += 1) {
        for (let j = 0; j < groups[i].rows.length; j += 1) sequence.push(groups[i].rows[j]);
      }
      for (let i = 0; i < sequence.length; i += 1) sequence[i].visualOrder = 1 + i * 10;

      for (let i = 0; i < groups.length; i += 1) {
        const group = groups[i];
        group.positions = group.domPositions;
        group.firstPosition = group.rows.length === 0 ? 0 : group.rows[0].domPosition;
      }

      let firstThirdPartyPosition = 0;
      for (let i = 0; i < sequence.length; i += 1) {
        if (sequence[i].thirdParty) {
          firstThirdPartyPosition = sequence[i].domPosition;
          break;
        }
      }

      let promotedCount = 0;
      for (let i = 0; i < rows.length; i += 1) if (rows[i].promoted) promotedCount += 1;

      return {
        rows: rows,
        sequence: sequence,
        bandPositions: band.map((row) => row.domPosition),
        groups: groups,
        firstThirdPartyPosition: firstThirdPartyPosition,
        thirdPartyCount: rows.length - band.length,
        promotedCount: promotedCount,
        groupingEnabled: grouping.enabled !== false,
        navBanded: !(cfg.nav !== undefined && cfg.nav !== null && cfg.nav.banded === false)
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
     * Every row gets the CSS `order` that lands it on its visual index, so
     * explicit per-entry positions work without touching the DOM. Captions are
     * pseudo-elements on the affected row, because Chromium ignores `order` on
     * a flex container's generated `::after`.
     *
     * @param plan - result of {@link planNav}.
     * @param headerLabel - band caption, already localized and counted.
     * @param labels - category id to display label.
     * @returns CSS text; empty when there is nothing to organize.
     */
    function buildCss(plan, headerLabel, labels) {
      if (plan === undefined || plan.thirdPartyCount === 0) return '';
      // The navigation layer is the fragile one (host class names); it can be
      // switched off entirely, leaving only the standalone panel.
      if (plan.navBanded === false) return '';
      const list = '[data-shortcut-modal="settings"] [class*="navList"]';
      const children = list + '>*';
      const at = (position) => children + ':nth-child(' + String(position) + ')';
      const rules = [];

      for (let i = 1; i < plan.sequence.length; i += 1) {
        const row = plan.sequence[i];
        if (row.visualOrder === 1) continue;
        rules.push(at(row.domPosition) + '{order:' + String(row.visualOrder) + '}');
      }

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
        const selector = at(row.domPosition);
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
      catApi: '接口', catHost: '宿主', catExperimental: '实验', catOther: '其他',
      panelTitle: '插件设置总览',
      panelTrigger: '插件设置总览',
      panelSubtitle: '已安装插件添加的设置入口，按类别收纳。',
      panelSearch: '搜索插件设置…',
      panelCount: '{count} 项',
      panelClose: '关闭',
      panelEmpty: '还没有插件添加设置入口。',
      panelEmptySearch: '没有匹配的入口。',
      panelPromoted: '已归入官方',
      panelRecenter: '复位位置',
      panelHint: '拖动标题可移动面板；点击左侧「设置」中的同名条目即可进入对应页面。'
    };
    const en = {
      navGroup: 'From plugins',
      navGroupCount: 'From plugins · {count}',
      catUi: 'Interface', catSettings: 'Settings', catSidebar: 'Sidebar', catSession: 'Sessions',
      catTools: 'Tools', catLlm: 'Models', catExec: 'Execution', catStorage: 'Storage',
      catApi: 'API', catHost: 'Host', catExperimental: 'Experimental', catOther: 'Other',
      panelTitle: 'Plugin settings',
      panelTrigger: 'Plugin settings overview',
      panelSubtitle: 'Settings entries added by installed plugins, grouped by category.',
      panelSearch: 'Search plugin settings…',
      panelCount: '{count} entries',
      panelClose: 'Close',
      panelEmpty: 'No plugin has added a settings entry yet.',
      panelEmptySearch: 'No matching entries.',
      panelPromoted: 'In the shipped band',
      panelRecenter: 'Reset position',
      panelHint: 'Drag the title to move this panel. Open Settings and pick the matching entry on the left to jump there.'
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


    /* ------------------------------------------------------------------ *
     * Panel: a standalone grouping interface.
     *
     * It renders its own overlay and cards, so it depends on no host class
     * name, no host DOM, and no shipped component: only the slot API, the
     * settings.section ledger, theme tokens (with fallbacks) and localStorage.
     * ------------------------------------------------------------------ */

    /** Open/closed store shared by the sidebar trigger and the overlay. */
    function createOpenStore(initial) {
      let open = initial === true;
      const listeners = new Set();
      return {
        get: () => open,
        set(next) {
          if (open === next) return;
          open = next;
          for (const listener of listeners) listener();
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        }
      };
    }

    /** One card per plugin-provided settings entry, resolved through the config. */
    function panelRows(entries, config) {
      const plan = planNav(entries, config);
      const rows = [];
      // Follow the visual sequence, not the DOM order the shell renders: the
      // panel must show the order the user arranged, including explicit
      // positions set by dragging.
      for (let i = 0; i < plan.sequence.length; i += 1) {
        const row = plan.sequence[i];
        if (!row.thirdParty && !row.promoted) continue;
        const renamed = typeof row.rename === 'string' && row.rename.length > 0;
        const id = row.id === undefined || row.id === null ? '' : String(row.id);
        rows.push({
          id: id,
          name: renamed ? row.rename : id,
          package: row.registrant === undefined || row.registrant === null ? '' : String(row.registrant),
          category: row.category,
          promoted: row.promoted === true
        });
      }
      return rows;
    }

    /** Bucket panel rows into the configured category order. */
    function panelGroups(rows, config, t) {
      const grouping = (config && config.grouping) || {};
      const order = Array.isArray(grouping.order) && grouping.order.length > 0
        ? grouping.order
        : ['other'];
      const byCategory = new Map();
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        if (!byCategory.has(row.category)) byCategory.set(row.category, []);
        byCategory.get(row.category).push(row);
      }
      const groups = [];
      const seen = new Set();
      const push = (category) => {
        if (seen.has(category)) return;
        seen.add(category);
        const list = byCategory.get(category);
        if (list === undefined || list.length === 0) return;
        groups.push({ category: category, label: categoryLabel(category, config, t), rows: list });
      };
      for (let i = 0; i < order.length; i += 1) push(order[i]);
      byCategory.forEach((list, category) => push(category));
      return groups;
    }

    /** Case-insensitive filter over display name, package and section id. */
    function filterPanelRows(rows, query) {
      const needle = String(query === undefined || query === null ? '' : query).trim().toLocaleLowerCase();
      if (needle.length === 0) return rows;
      const out = [];
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const haystack = [row.name, row.package, row.id];
        for (let j = 0; j < haystack.length; j += 1) {
          if (String(haystack[j]).toLocaleLowerCase().indexOf(needle) !== -1) {
            out.push(row);
            break;
          }
        }
      }
      return out;
    }

    /** Subscribe a component to the open store. */
    function useOpen(store) {
      const state = React.useState(store.get());
      const value = state[0];
      const setValue = state[1];
      React.useEffect(() => store.subscribe(() => setValue(store.get())), [store]);
      return value;
    }

    /** Sidebar-foot trigger. */
    function PanelTrigger(props) {
      const t = props.t;
      const open = useOpen(props.store);
      return h('button', {
        type: 'button',
        className: 'po-trigger',
        'data-open': open ? 'true' : 'false',
        'aria-label': t('panelTrigger'),
        title: t('panelTitle'),
        onClick: () => props.store.set(true)
      }, h('svg', { viewBox: '0 0 16 16', width: 16, height: 16, 'aria-hidden': true },
        h('rect', { x: 1.5, y: 1.5, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.95 }),
        h('rect', { x: 9, y: 1.5, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.7 }),
        h('rect', { x: 1.5, y: 9, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.7 }),
        h('rect', { x: 9, y: 9, width: 5.5, height: 5.5, rx: 1.5, fill: 'currentColor', opacity: 0.45 })));
    }

    /** The overlay: grouped cards, live search, animated disclosure. */
    function OrganizerPanel(props) {
      const t = props.t;
      const open = useOpen(props.store);
      const queryState = React.useState('');
      const query = queryState[0];
      const setQuery = queryState[1];
      const collapsedState = React.useState({});
      const collapsed = collapsedState[0];
      const setCollapsed = collapsedState[1];
      const panelRef = React.useRef(null);
      const titleId = React.useId();
      const posState = React.useState(() => readPanelPosition(globalThis));
      const position = posState[0];
      const setPosition = posState[1];
      const draggingState = React.useState(false);
      const dragging = draggingState[0];
      const setDragging = draggingState[1];
      const dragRef = React.useRef(null);
      const positionRef = React.useRef(position);
      const revisionState = React.useState(0);
      const revision = revisionState[0];
      const setRevision = revisionState[1];
      // Keep the panel mounted briefly after close so it can animate out.
      const visibleState = React.useState(open);
      const visible = visibleState[0];
      const setVisible = visibleState[1];

      React.useEffect(() => { positionRef.current = position; }, [position]);

      const recenter = () => {
        clearPanelPosition(globalThis);
        setPosition(null);
      };


      React.useEffect(() => {
        if (open) {
          if (!visible) setVisible(true);
          return undefined;
        }
        if (!visible) return undefined;
        const timer = setTimeout(() => setVisible(false), 180);
        return () => clearTimeout(timer);
      }, [open, visible]);

      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') props.store.set(false);
        };
        document.addEventListener('keydown', onKey);
        const focus = setTimeout(() => {
          const node = panelRef.current;
          if (node !== null && node !== undefined) node.focus();
        }, 0);
        return () => {
          document.removeEventListener('keydown', onKey);
          clearTimeout(focus);
        };
      }, [open, props.store]);

      // Window drag with native listeners: pointer capture through React's
      // synthetic layer is easy to lose, so the handle and the move/up
      // listeners are attached directly to the nodes.
      React.useEffect(() => {
        if (!open) return undefined;
        const panel = panelRef.current;
        if (panel === null || panel === undefined) return undefined;
        const handle = panel.querySelector('[data-drag-handle="true"]');
        if (handle === null || handle === undefined) return undefined;
        let start = null;
        const onDown = (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          if (event.target instanceof Element
            && event.target.closest('button, input, [data-card="true"]') !== null) return;
          const rect = panel.getBoundingClientRect();
          start = { dx: event.clientX - rect.left, dy: event.clientY - rect.top, width: rect.width, height: rect.height };
          setDragging(true);
          if (typeof handle.setPointerCapture === 'function') {
            try { handle.setPointerCapture(event.pointerId); } catch (error) { /* best effort */ }
          }
          event.preventDefault();
        };
        const onMove = (event) => {
          if (start === null) return;
          setPosition(clampPanelPosition(
            { left: event.clientX - start.dx, top: event.clientY - start.dy },
            { width: start.width, height: start.height },
            { width: globalThis.innerWidth, height: globalThis.innerHeight }
          ));
        };
        const onUp = () => {
          if (start === null) return;
          start = null;
          setDragging(false);
          setTimeout(() => {
            const settled = positionRef.current;
            if (settled !== null && settled !== undefined) writePanelPosition(globalThis, settled);
          }, 0);
        };
        handle.addEventListener('pointerdown', onDown);
        globalThis.addEventListener('pointermove', onMove);
        globalThis.addEventListener('pointerup', onUp);
        globalThis.addEventListener('pointercancel', onUp);
        return () => {
          handle.removeEventListener('pointerdown', onDown);
          globalThis.removeEventListener('pointermove', onMove);
          globalThis.removeEventListener('pointerup', onUp);
          globalThis.removeEventListener('pointercancel', onUp);
        };
      }, [open, setPosition, setDragging]);

      // Card drag: reorder inside one category, then persist the new order as
      // explicit positions. Works with the same native listener model.
      React.useEffect(() => {
        if (!open) return undefined;
        const panel = panelRef.current;
        if (panel === null || panel === undefined) return undefined;
        let drag = null;
        const cardsIn = (category) => Array.from(panel.querySelectorAll('[data-card="true"][data-category="' + category + '"]'));
        const clearMarks = () => {
          const marked = panel.querySelectorAll('[data-drop="true"]');
          for (let i = 0; i < marked.length; i += 1) marked[i].setAttribute('data-drop', 'false');
        };
        const onDown = (event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return;
          const card = event.target instanceof Element ? event.target.closest('[data-card="true"]') : null;
          if (card === null || card === undefined) return;
          if (event.target.closest('button') !== null) return;
          drag = { id: card.getAttribute('data-id'), category: card.getAttribute('data-category') };
          card.setAttribute('data-dragging', 'true');
          event.preventDefault();
        };
        const onMove = (event) => {
          if (drag === null) return;
          const cards = cardsIn(drag.category).filter((node) => node.getAttribute('data-id') !== drag.id);
          const centres = cards.map((node) => {
            const rect = node.getBoundingClientRect();
            return rect.top + rect.height / 2;
          });
          const index = dropIndexAt(centres, event.clientY);
          clearMarks();
          if (cards.length === 0) return;
          const target = cards[Math.min(index, cards.length - 1)];
          target.setAttribute('data-drop', 'true');
          drag.index = index;
        };
        const onUp = () => {
          if (drag === null) return;
          const finished = drag;
          drag = null;
          clearMarks();
          const dragged = panel.querySelector('[data-card="true"][data-id="' + finished.id + '"]');
          if (dragged !== null && dragged !== undefined) dragged.setAttribute('data-dragging', 'false');
          if (typeof finished.index !== 'number') return;
          const ids = cardsIn(finished.category).map((node) => node.getAttribute('data-id'));
          const next = reorderIds(ids, finished.id, finished.index);
          if (next.join(',') === ids.join(',')) return;
          writePositionOverride(globalThis, positionsForOrder(next));
          setRevision((value) => value + 1);
          if (typeof props.refreshNav === 'function') props.refreshNav();
        };
        panel.addEventListener('pointerdown', onDown);
        globalThis.addEventListener('pointermove', onMove);
        globalThis.addEventListener('pointerup', onUp);
        globalThis.addEventListener('pointercancel', onUp);
        return () => {
          panel.removeEventListener('pointerdown', onDown);
          globalThis.removeEventListener('pointermove', onMove);
          globalThis.removeEventListener('pointerup', onUp);
          globalThis.removeEventListener('pointercancel', onUp);
        };
      }, [open, props]);

      if (!open && !visible) return null;

      const config = props.config(revision);
      const all = panelRows(props.read(), config);
      const rows = filterPanelRows(all, query);
      const groups = panelGroups(rows, config, t);
      const searching = String(query).trim().length > 0;
      // Stagger index must run across groups, not restart inside each one.
      const staggerStart = new Map();
      let running = 0;
      for (let i = 0; i < groups.length; i += 1) {
        staggerStart.set(groups[i].category, running);
        running += groups[i].rows.length;
      }

      return h('div', {
        className: 'po-root',
        'data-plugin-organizer-panel': 'true',
        'data-closing': open ? 'false' : 'true'
      },
        h('div', { className: 'po-mask', 'aria-hidden': 'true', onClick: () => props.store.set(false) }),
        h('div', {
          className: 'po-panel',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': titleId,
          tabIndex: -1,
          ref: panelRef,
          'data-dragging': dragging ? 'true' : 'false',
          style: position === null || position === undefined
            ? undefined
            : { position: 'absolute', left: String(position.left) + 'px', top: String(position.top) + 'px' }
        },
          h('header', { className: 'po-head', 'data-drag-handle': 'true' },
            h('div', { className: 'po-head-text' },
              h('h2', { className: 'po-title', id: titleId }, t('panelTitle')),
              h('p', { className: 'po-subtitle' }, t('panelSubtitle'))),
            h('span', { className: 'po-count' }, t('panelCount').split('{count}').join(String(all.length))),
            h('button', {
              type: 'button', className: 'po-close', 'aria-label': t('panelRecenter'), title: t('panelRecenter'),
              onClick: recenter
            }, h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
              h('path', {
                d: 'M8 2.5L8 8M8 8L5.2 5.2M8 8L10.8 5.2M2.5 13.5h11', stroke: 'currentColor',
                strokeWidth: 1.4, strokeLinecap: 'round', fill: 'none'
              }))),
            h('button', {
              type: 'button', className: 'po-close', 'aria-label': t('panelClose'),
              onClick: () => props.store.set(false)
            }, h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
              h('path', {
                d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', fill: 'none'
              })))),
          h('label', { className: 'po-search' },
            h('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true },
              h('circle', { cx: 7, cy: 7, r: 4.5, stroke: 'currentColor', strokeWidth: 1.5, fill: 'none' }),
              h('path', { d: 'M10.5 10.5L13.5 13.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })),
            h('span', { className: 'po-visually-hidden' }, t('panelSearch')),
            h('input', {
              type: 'search', value: query, placeholder: t('panelSearch'),
              'aria-label': t('panelSearch'),
              onChange: (event) => setQuery(event.currentTarget.value)
            })),
          h('div', { className: 'po-body' },
            rows.length === 0
              ? h('p', { className: 'po-empty' }, searching ? t('panelEmptySearch') : t('panelEmpty'))
              : groups.map((group) => {
                const isOpen = searching || collapsed[group.category] !== true;
                return h('section', { key: group.category, className: 'po-group', 'data-category': group.category },
                  h('button', {
                    type: 'button', className: 'po-group-head', 'aria-expanded': isOpen,
                    onClick: () => setCollapsed((current) => {
                      const next = {};
                      Object.keys(current).forEach((key) => { next[key] = current[key]; });
                      next[group.category] = !(current[group.category] === true);
                      return next;
                    })
                  },
                    h('span', { className: 'po-chevron', 'data-open': isOpen ? 'true' : 'false' },
                      h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true },
                        h('path', {
                          d: 'M4 6l4 4 4-4', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round',
                          strokeLinejoin: 'round', fill: 'none'
                        }))),
                    h('span', { className: 'po-group-label' }, group.label),
                    h('span', { className: 'po-group-count' }, String(group.rows.length))),
                  h('div', { className: 'po-group-body', 'data-open': isOpen ? 'true' : 'false' },
                    h('div', { className: 'po-group-inner' },
                      group.rows.map((row, rowIndex) => {
                        const index = staggerStart.get(group.category) + rowIndex;
                        return h('article', {
                          key: group.category + ':' + row.id,
                          className: 'po-card',
                          'data-card': 'true',
                          'data-id': row.id,
                          'data-category': group.category,
                          'data-dragging': 'false',
                          'data-drop': 'false',
                          'data-promoted': row.promoted ? 'true' : 'false',
                          style: { '--po-i': String(index) }
                        },
                          h('span', { className: 'po-card-name' }, row.name),
                          row.package === '' ? null : h('code', { className: 'po-card-pkg' }, row.package),
                          row.promoted ? h('span', { className: 'po-badge' }, t('panelPromoted')) : null);
                      }))));
              })),
          h('footer', { className: 'po-foot' }, t('panelHint'))));
    }

    /** All panel CSS, theme tokens first with readable fallbacks. */
    const PANEL_CSS = [
      '.po-root{--po-ease:cubic-bezier(.2,.7,.3,1);position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;pointer-events:auto}',
      '.po-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:blur(2px);animation:po-fade 180ms var(--po-ease) both}',
      '.po-panel{position:relative;display:flex;flex-direction:column;width:min(640px,calc(100vw - 48px));max-height:min(76vh,720px);border:0.5px solid var(--dsw-alias-border-l3,rgba(255,255,255,.16));border-radius:16px;background:var(--dsw-alias-bg-layer-2,#1b1b1e);box-shadow:0 18px 60px rgba(0,0,0,.45);color:var(--dsw-alias-label-primary,#f2f2f3);overflow:hidden;animation:po-rise 240ms var(--po-ease) both}',
      '.po-panel:focus{outline:none}',
      '.po-head{display:flex;align-items:flex-start;gap:12px;padding:18px 18px 12px;cursor:grab;touch-action:none;user-select:none}',
      '.po-panel[data-dragging="true"] .po-head{cursor:grabbing}',
      '.po-panel[data-dragging="true"]{transition:none}',
      '.po-head-text{flex:1 1 auto;min-width:0}',
      '.po-title{margin:0;font-size:16px;line-height:24px;font-weight:600;letter-spacing:.01em}',
      '.po-subtitle{margin:2px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b8b90)}',
      '.po-count{flex:none;font-size:11px;line-height:20px;padding:2px 9px;border-radius:999px;border:0.5px solid var(--dsw-alias-border-l3,rgba(255,255,255,.16));color:var(--dsw-alias-label-secondary,#c9c9cd);font-variant-numeric:tabular-nums}',
      '.po-close{flex:none;width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#8b8b90);cursor:pointer;transition:background 150ms var(--po-ease),color 150ms var(--po-ease),transform 150ms var(--po-ease)}',
      '.po-close:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#f2f2f3);transform:rotate(90deg)}',
      '.po-search{display:flex;align-items:center;gap:8px;margin:0 18px 10px;padding:0 12px;height:36px;border:0.5px solid var(--dsw-alias-border-l4,rgba(255,255,255,.24));border-radius:10px;background:var(--dsw-alias-bg-layer-1,#232326);color:var(--dsw-alias-label-tertiary,#8b8b90);transition:border-color 160ms var(--po-ease),box-shadow 160ms var(--po-ease)}',
      '.po-search:focus-within{border-color:var(--dsw-alias-state-business-primary,#4c8dff);box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary,#4c8dff) 18%,transparent)}',
      '.po-search input{flex:1 1 auto;min-width:0;border:0;outline:none;background:transparent;color:var(--dsw-alias-label-primary,#f2f2f3);font:inherit;font-size:13px}',
      '.po-search input::placeholder{color:var(--dsw-alias-label-tertiary,#8b8b90)}',
      '.po-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:2px 12px 8px}',
      '.po-group+.po-group{margin-top:4px}',
      '.po-group-head{display:flex;align-items:center;gap:8px;width:100%;padding:9px 6px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;border-radius:8px;transition:background 150ms var(--po-ease)}',
      '.po-group-head:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
      '.po-group-head:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c8dff));outline-offset:2px}',
      '.po-chevron{display:inline-flex;color:var(--dsw-alias-label-tertiary,#8b8b90);transition:transform 200ms var(--po-ease)}',
      '.po-chevron[data-open="false"]{transform:rotate(-90deg)}',
      '.po-group-label{flex:1 1 auto;font-size:13px;line-height:20px;font-weight:500}',
      '.po-group-count{flex:none;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b8b90);font-variant-numeric:tabular-nums}',
      '.po-group-body{display:grid;grid-template-rows:1fr;transition:grid-template-rows 220ms var(--po-ease)}',
      '.po-group-body[data-open="false"]{grid-template-rows:0fr}',
      '.po-group-inner{display:flex;flex-direction:column;gap:8px;overflow:hidden;padding-bottom:6px;transition:padding-bottom 220ms var(--po-ease)}',
      '.po-group-body[data-open="false"] .po-group-inner{padding-bottom:0}',
      '.po-card{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;padding:10px 12px;border:0.5px solid var(--dsw-alias-settings-card-stroke,var(--dsw-alias-border-l2,rgba(255,255,255,.12)));border-radius:12px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1,#232326));animation:po-card 320ms var(--po-ease) backwards;animation-delay:calc(var(--po-i,0) * 26ms);transition:transform 170ms var(--po-ease),border-color 170ms var(--po-ease),box-shadow 170ms var(--po-ease)}',
      '.po-card{cursor:grab;position:relative}',
      '.po-card:hover{transform:translateY(-1px);border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.2));box-shadow:0 8px 22px rgba(0,0,0,.22)}',
      '.po-card[data-dragging="true"]{cursor:grabbing;z-index:1;opacity:.9;transform:translateY(-1px) scale(.995);box-shadow:0 14px 30px rgba(0,0,0,.32)}',
      '.po-card[data-drop="true"]{box-shadow:inset 0 2px 0 var(--dsw-alias-state-business-primary,#4c8dff)}',
      '.po-card[data-promoted="true"]{border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4c8dff) 40%,transparent)}',
      '.po-card-name{flex:1 1 auto;min-width:0;font-size:13px;line-height:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.po-card-pkg{flex:none;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;line-height:18px;color:var(--dsw-alias-label-tertiary,#8b8b90)}',
      '.po-badge{flex:none;font-size:10px;line-height:16px;padding:1px 7px;border-radius:999px;color:var(--dsw-alias-state-business-primary,#4c8dff);border:0.5px solid color-mix(in srgb,var(--dsw-alias-state-business-primary,#4c8dff) 45%,transparent)}',
      '.po-empty{margin:18px 6px;color:var(--dsw-alias-label-tertiary,#8b8b90);font-size:13px;line-height:20px}',
      '.po-foot{flex:none;padding:10px 18px 14px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary,#8b8b90);border-top:0.5px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12))}',
      '.po-trigger{display:inline-flex;align-items:center;justify-content:center;width:auto;min-width:32px;height:32px;padding:0 6px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary,#8b8b90);cursor:pointer;transition:background 150ms var(--po-ease),color 150ms var(--po-ease)}',
      '.po-trigger:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.08));color:var(--dsw-alias-label-primary,#f2f2f3)}',
      '.po-trigger[data-open="true"]{color:var(--dsw-alias-label-primary,#f2f2f3)}',
      '.po-trigger:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#4c8dff));outline-offset:2px}',
      '.po-visually-hidden{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}',
      '.po-root[data-closing="true"]{pointer-events:none}',
      '.po-root[data-closing="true"] .po-mask{animation:po-fade-out 170ms var(--po-ease) both}',
      '.po-root[data-closing="true"] .po-panel{animation:po-rise-out 170ms var(--po-ease) both}',
      '.po-root[data-closing="true"] .po-card{animation:none}',
      '@keyframes po-fade{from{opacity:0}to{opacity:1}}',
      '@keyframes po-fade-out{from{opacity:1}to{opacity:0}}',
      '@keyframes po-rise-out{from{opacity:1;transform:none}to{opacity:0;transform:translateY(6px) scale(.99)}}',
      '@keyframes po-rise{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}',
      '@keyframes po-card{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}',
      '@media (prefers-reduced-motion: reduce){',
      '.po-mask,.po-panel,.po-card{animation:none!important}',
      '.po-root[data-closing="true"] .po-mask,.po-root[data-closing="true"] .po-panel{animation:none!important}',
      '.po-group-body{transition:none!important}',
      '.po-card,.po-close,.po-chevron,.po-trigger{transition:none!important}',
      '.po-card:hover{transform:none}',
      '.po-close:hover{transform:none}',
      '}'
    ].join('\n');

    /** Keep the settings navigation banded, grouped, and renamed as configured. */
    function apply(ctx) {
      // Set by the navigation effect below; the panel calls it after a reorder.
      const navRefresh = { current: () => {} };
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
        navRefresh.current = rebuild;
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

      const store = createOpenStore(false);
      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin-organizer', 'panel');
        style.textContent = PANEL_CSS;
        document.head.appendChild(style);
        return () => {
          if (style.parentNode) style.parentNode.removeChild(style);
        };
      }, 'plugin-organizer: panel styles');

      const readSections = () => read();
      ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action',
        id: 'plugin-organizer-trigger',
        order: 10,
        label: () => t('panelTrigger'),
        locale: NS,
        inject: () => ({ store: store })
      }, PanelTrigger));

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'plugin-organizer-panel',
        order: 120,
        label: () => t('panelTitle'),
        locale: NS,
        inject: () => ({
          store: store,
          read: readSections,
          config: () => readConfig(globalThis),
          refreshNav: () => navRefresh.current()
        })
      }, OrganizerPanel));

      return { reload: reload, store: store };
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
        createOpenStore: createOpenStore,
        reorderIds: reorderIds,
        positionsForOrder: positionsForOrder,
        dropIndexAt: dropIndexAt,
        readOverride: readOverride,
        writePositionOverride: writePositionOverride,
        PANEL_POSITION_KEY: PANEL_POSITION_KEY,
        clampPanelPosition: clampPanelPosition,
        readPanelPosition: readPanelPosition,
        writePanelPosition: writePanelPosition,
        clearPanelPosition: clearPanelPosition,
        panelRows: panelRows,
        panelGroups: panelGroups,
        filterPanelRows: filterPanelRows,
        PanelTrigger: PanelTrigger,
        OrganizerPanel: OrganizerPanel,
        PANEL_CSS: PANEL_CSS,
        categoryLabel: categoryLabel,
        dictionaries: { zh: zh, en: en },
        SHIPPED_SECTION_IDS: SHIPPED_SECTION_IDS
      }
    };
  }
});
