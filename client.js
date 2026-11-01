window.__ModuleLoader__.load({
  id: '@local/plugin-organizer',
  factory() {
    const NS = 'pluginOrganizer';

    /** Services: the slot ledger (nav rows) and the locale dictionaries. */
    const inject = ['slots', 'locale'];

    /**
     * Sections the dsh installation itself ships. Used only when a registration
     * carries no `registrant` stamp, so the split still works on older hosts.
     */
    const SHIPPED_SECTION_IDS = ['account', 'general', 'models', 'plugins', 'agent-presets'];

    /**
     * Read one ledger entry's options. The slot service stores the registration
     * options under `entry.options`; a bare options object is accepted too so the
     * projection stays testable without the service.
     * @param entry - StoredEntry or a bare options object.
     * @returns the options object.
     */
    function optionsOf(entry) {
      if (entry === undefined || entry === null || typeof entry !== 'object') return {};
      const options = entry.options;
      if (options !== undefined && options !== null && typeof options === 'object') return options;
      return entry;
    }

    /** Whether one `settings.section` registration came from a plugin the user installed. */
    function isThirdParty(entry) {
      const options = optionsOf(entry);
      const registrant = options.registrant;
      if (typeof registrant === 'string' && registrant.length > 0) {
        // Shipped client packages live under the @deepseek-ai scope; anything the
        // user installed into the profile arrives under its own scope or bare name.
        return registrant.indexOf('@deepseek-ai/') !== 0;
      }
      return SHIPPED_SECTION_IDS.indexOf(options.id) === -1;
    }

    /**
     * Project ledger entries into nav positions.
     * Mirrors the settings shell exactly: it maps `entries('settings.section')`
     * to `{id, order}` and sorts by `order` with a stable sort, then renders one
     * button per row — so a 1-based position here is that row's `nth-child`.
     * @param entries - live `settings.section` entries.
     * @returns row plan, including the plugin rows' positions.
     */
    function planNav(entries) {
      const list = Array.isArray(entries) ? entries : [];
      const rows = [];
      for (let i = 0; i < list.length; i += 1) {
        const options = optionsOf(list[i]);
        rows.push({
          id: options.id,
          registrant: options.registrant,
          order: typeof options.order === 'number' ? options.order : 0,
          registeredAt: i,
          thirdParty: isThirdParty(list[i])
        });
      }
      rows.sort((a, b) => (a.order - b.order) || (a.registeredAt - b.registeredAt));
      const pluginPositions = [];
      let firstPluginPosition = 0;
      let builtInCount = 0;
      for (let i = 0; i < rows.length; i += 1) {
        if (rows[i].thirdParty) {
          pluginPositions.push(i + 1);
          if (firstPluginPosition === 0) firstPluginPosition = i + 1;
        } else {
          builtInCount += 1;
        }
      }
      return {
        rows: rows,
        pluginPositions: pluginPositions,
        firstPluginPosition: firstPluginPosition,
        builtInCount: builtInCount,
        pluginCount: pluginPositions.length
      };
    }

    /** Escape one CSS string literal body. */
    function cssString(value) {
      return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, ' ');
    }

    /**
     * Build the stylesheet that files plugin rows below the shipped ones.
     *
     * Rows move with flex `order` only (the nav list is a column flex container).
     * The divider is drawn on the FIRST plugin row: Chromium ignores `order` on a
     * flex container's generated `::after`, so a pseudo item cannot be sorted
     * between the two bands.
     *
     * @param plan - result of {@link planNav}.
     * @param label - divider caption in the active locale.
     * @returns CSS text; empty when there is nothing to split.
     */
    function buildCss(plan, label) {
      if (plan === undefined || plan.pluginCount === 0) return '';
      // Scoped to the settings dialog: `data-shortcut-modal` is a stable host
      // attribute, so the rules never touch another navigation list.
      const list = '[data-shortcut-modal="settings"] [class*="navList"]';
      const children = list + '>*';
      const first = children + ':nth-child(' + String(plan.firstPluginPosition) + ')';
      const pluginSelector = plan.pluginPositions
        .map((position) => children + ':nth-child(' + String(position) + ')')
        .join(',');
      return [
        children + '{order:1}',
        pluginSelector + '{order:2}',
        first + '{margin-top:34px;border-top:0.5px solid var(--dsw-alias-border-l2);position:relative}',
        first + '::before{' + [
          'content:"' + cssString(label) + '"',
          'position:absolute',
          'left:12px',
          'top:-20px',
          'right:12px',
          'color:var(--dsw-alias-label-tertiary)',
          'font-size:11px',
          'line-height:16px',
          'letter-spacing:0.02em',
          'white-space:nowrap',
          'overflow:hidden',
          'text-overflow:ellipsis',
          'pointer-events:none'
        ].join(';') + '}'
      ].join('\n');
    }

    /** Dictionaries: every visible string goes through the Client locale service. */
    const zh = {
      navGroup: '插件提供',
      navGroupCount: '插件提供 · {count}'
    };
    const en = {
      navGroup: 'From plugins',
      navGroupCount: 'From plugins · {count}'
    };

    /**
     * Keep the settings navigation split into shipped rows and plugin rows.
     * @param ctx - plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }),
        'plugin-organizer: dictionaries');
      const t = ctx.locale.bind(NS);
      const caption = (plan) => {
        const template = t('navGroupCount');
        const text = typeof template === 'string' && template.indexOf('{count}') !== -1
          ? template
          : t('navGroup');
        return String(text).split('{count}').join(String(plan.pluginCount));
      };
      const read = () => {
        const slots = ctx.slots;
        if (slots === undefined) return [];
        // Exactly the view the shell projects; `entriesOfSlot` drops shadowed
        // duplicates and could disagree with the rows actually rendered.
        const entries = slots.entries('settings.section');
        return Array.isArray(entries) ? entries : [];
      };

      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin-organizer', 'nav-groups');
        document.head.appendChild(style);
        const rebuild = () => {
          const plan = planNav(read());
          style.textContent = buildCss(plan, caption(plan));
        };
        rebuild();
        const offSlot = typeof ctx.slots.subscribe === 'function'
          ? ctx.slots.subscribe('settings.section', rebuild)
          : () => {};
        const offLocale = typeof ctx.locale.subscribe === 'function'
          ? ctx.locale.subscribe(rebuild)
          : () => {};
        // Sections registered during boot can land after this effect runs.
        const settle = [setTimeout(rebuild, 0), setTimeout(rebuild, 400)];
        return () => {
          offSlot();
          offLocale();
          settle.forEach((id) => clearTimeout(id));
          if (style.parentNode) style.parentNode.removeChild(style);
        };
      }, 'plugin-organizer: settings nav groups');
    }

    return {
      inject: inject,
      apply: apply,
      /** Pure helpers, exposed for this bundle's own tests. */
      __internals: {
        optionsOf: optionsOf,
        isThirdParty: isThirdParty,
        planNav: planNav,
        buildCss: buildCss,
        dictionaries: { zh: zh, en: en },
        SHIPPED_SECTION_IDS: SHIPPED_SECTION_IDS
      }
    };
  }
});
