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

## 开发与测试

```bash
node --check client.js
node test-organizer.mjs      # 40 项断言：来源判定、位次、视觉分组、样式内容、自动重算
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
