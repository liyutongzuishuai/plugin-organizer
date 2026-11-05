# 插件设置收纳 (plugin-organizer)

一个 dsh Web 端的持久化插件：把**插件添加的设置入口**统一收纳到设置导航下方，用一条分割线与**官方自带的设置**分开。

## 效果

```
账号与余额          ← 官方（dsh 自带）
通用设置
模型
内置插件
Agent 预设
──────────────  插件提供 · 12
WorkBuddy           ← 插件安装的
视觉模型
已归档会话
…
```

- 官方行、插件行各自保持原有先后次序，只是整组下移。
- 分割线带计数，装/卸插件后自动重算，无需重装。
- 跟随界面语言：中文「插件提供 · N」/ English「From plugins · N」。

## 原理

- 来源判定读每条 `settings.section` 注册携带的 `registrant`（注册包名）：`@deepseek-ai/*` 视为随 dsh 发行自带，其余视为用户安装的插件；缺失时回退到官方 section id 白名单。
- 排序只依赖 CSS：设置导航容器是纵向 flex，官方行 `order:1`、插件行 `order:2`；分割线画在第一条插件行上（`margin-top` + `border-top` + 绝对定位的 `::before` 标题）。
- 不修改宿主 DOM、不重写设置面板，因此官方的打开/关闭、快捷键、首次引导、断线重连提示全部保持原样；宿主若改变类名，最坏结果只是不再显示分割线。

> 注：Chromium 会忽略 flex 容器 `::after` 上的 `order`，所以分割线不能做成容器的伪元素项。

## 安装

从 GitHub 装（推荐，随时跟进最新提交）：

```bash
dsh plugin add git+https://github.com/liyutongzuishuai/plugin-organizer.git
```

从本地目录装（开发用；profile 会建立 link，改源码后刷新页面即生效）：

```bash
dsh plugin add /path/to/plugin-organizer
```

也可以在会话里用 `plugin_manager` 的 `install_bundle` 指向本目录。装好后重启/刷新 Web 页面，打开 **设置** 即可看到分区。

## 兼容性

- 适用于 dsh `0.2.x` 的 Web 客户端（依赖 `settings.section` 注册项上的 `registrant` 与导航容器的 flex 布局）。
- 只在设置对话框内生效；不修改宿主 DOM，不替换任何官方组件。
- 若宿主改变导航类名，插件不会报错，只是不再显示分区线。

## 加入插件市场索引

本仓库自带一份 format 1 市场索引：[`market/index.json`](market/index.json)。在 dsh 里打开
**插件 → 发现（Discover）→ 添加索引源**，填入：

```
https://raw.githubusercontent.com/liyutongzuishuai/plugin-organizer/main/market/index.json
```

即可在市场里搜到并以锁定 commit 的方式安装。该文件用
`@deepseek-ai/dsh-plugin-market-index` 的 `parseMarketIndex` 校验通过。

同一插件也已提交到社区精选列表 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（条目文件 `data/plugins/liyutongzuishuai__plugin-organizer.yml`）。

## 分组面板（独立界面）

侧栏底部「设置」旁多了一个九宫格按钮，点开是插件自带的分组面板——**不依赖宿主的类名与 DOM**，
自带弹层、搜索、分组折叠与入场动效：

- 只读 `settings.section` 账本 + 主题令牌（每个令牌都带兜底色值，缺令牌也能看）
- 不读取、不修改宿主编译后的样式类名；宿主改版最坏是配色不跟随，不会白屏或错位
- 动效：遮罩淡入 180ms、面板上浮 240ms、卡片按 26ms 递增错峰入场；关闭时面板与遮罩
  170ms 淡出后卸载（期间不再接收点击）；分组折叠用 `grid-template-rows` 过渡 220ms；
  `prefers-reduced-motion: reduce` 时全部关闭
- 键盘：`Esc` 关闭、打开时焦点进入面板；`role="dialog"` + `aria-modal` + 标题关联
- **可拖动**：拖标题移动面板，松手后位置存进 `localStorage`（键 `dsh-plugin-organizer:panel-position`），
  重开仍在原处；位置会被钳制在视口内（四周留 8px）；标题右侧「复位位置」按钮清除记忆回到居中
- 面板内改名与分组复用 `nav-config.json` 的 `rename` / `grouping`，被提升的入口显示「已归入官方」标记

面板是总览：点卡片不会跳转（宿主没有暴露切换设置页的服务），底部提示告诉你在左侧设置里点同名条目。
需要直接改导航顺序时，仍由下面的 CSS 分区负责；两者可以同时启用。

## 配置：分组 / 重命名 / 当成官方

用命令行改，一条命令同时写入配置并烘焙进客户端，**刷新页面即生效**：

```bash
node scripts/nav.mjs official workbuddy-ai     # 把某条第三方入口提到官方区
node scripts/nav.mjs rename dsh-usage 用量统计   # 改名
node scripts/nav.mjs assign pet settings        # 指定分组（section id 或包名）
node scripts/nav.mjs position dsh-usage 1       # 指定它在所属分组里的第几位（1 = 最前）
node scripts/nav.mjs category add mine 我的分组   # 新建分组（会自动排到最后）
node scripts/nav.mjs label settings 设置入口      # 改分组标题
node scripts/nav.mjs order ui,settings,tools    # 调整分组顺序
node scripts/nav.mjs grouping off               # 关掉分组
node scripts/nav.mjs show                       # 看当前配置
```

`unassign` / `unrename` / `unofficial` 是对应的撤销命令。

`position` 接受任意数字，作用范围是**它所属的那一段**：官方区的条目和官方区比，插件条目和同组比；
没写 `position` 的条目排在写了之后，彼此保持插件自己的注册顺序。`unposition` 恢复自然位置。

`category add` 新建分组后，用 `assign` 把条目放进去；`category remove` 会同时清理顺序、标题和指向它的归类。

另外可用 `node scripts/nav.mjs nav off` 关掉**导航内的分区改写**——那一层依赖宿主类名，
是最薄弱的部分；关掉后只保留完全独立的面板。默认开启。也可以直接编辑仓库根的
`nav-config.json`，再执行 `node scripts/build-config.mjs` 烘焙、`--check` 校验同步。

三个字段：

```jsonc
{
  "nav": { "banded": true },     // false = 不再改写导航，只用面板
  "position": { "pet": 1 },      // 逐项定位：官方区/分组内第几位
  "grouping": {
    "enabled": true,              // false = 插件区不再按类分组
    "order": ["ui", "settings"],  // 分组顺序
    "labels": { "ui": "界面" },    // 分组标题（不写则用内置中英文字典）
    "assign": { "pet": "ui" }     // 强制某个入口归到某组（填 section id 或包名）
  },
  "rename": {
    "dsh-usage": "用量统计"        // 显示名替换（section id 或包名均可）
  },
  "official": [
    "workbuddy-ai"                // 当成官方：把这条入口提到分割线以上
  ]
}
```

- **分组**：插件区内部再按类别分组，每组首行上方显示组名；组内保持插件自己的注册顺序。
- **重命名**：隐藏宿主原本的标签，按配置绘制新名字，只影响显示。
- **当成官方**：被列出的入口按官方规则排序（`order: 1`），出现在分割线上方的官方带里，计数随之减少。

临时试验可以不改文件，直接把覆盖写进浏览器：

```js
localStorage.setItem('dsh-plugin-organizer:config',
  JSON.stringify({ grouping: { enabled: false } }));
// 想撤销：localStorage.removeItem('dsh-plugin-organizer:config')
```

`localStorage` 覆盖只合并 `grouping` / `rename` / `official` 三项，刷新页面生效；写坏 JSON 会被忽略，不会影响设置面板。

## 开发与测试

```bash
node --check client.js
node scripts/build-config.mjs --check   # 配置与 client.js 是否同步
node test-organizer.mjs                 # 分组 / 重命名 / 提升 / 样式 / 自动重算
```

主要文件：

| 文件 | 作用 |
|---|---|
| `client.js` | 浏览器端：`isThirdParty()` 判定来源、`planNav()` 计算导航位次、`buildCss()` 生成样式 |
| `index.js` | 宿主端空实现（占位 Loader 行） |
| `cordis.patch.yml` | Loader 插入行 |
| `locale/{zh,en}.json` | 插件标题与描述 |

## 许可

MIT
