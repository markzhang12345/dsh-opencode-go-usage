# dsh-opencode-go-usage

[English](README.md) | [中文](README.zh.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 插件：在聊天输入栏下方的 Dock 栏常驻显示你 **OpenCode Go** 套餐的使用量 —— `OpenCode Go  5h 39%  Weekly 15%  Monthly 13%`，每 60 秒自动刷新。仅当当前默认模型供应商为 `opencode-go` 时启用，否则自动隐藏。

## 功能

- 聊天输入栏下方常驻读数（`conversation.composer.dock`）：5 小时滚动 / 每周 / 每月 的百分比，悬停显示重置时间
- 每 60 秒自动刷新
- 仅当当前模型供应商为 `opencode-go` 时自动启用，否则不显示
- 也可在对话中直接询问："查一下 opencode go 用量"，即可获得数字
- 纯数字显示，无进度条

## 安装

在你的 dsh profile（此处为 `web`）：

```sh
dsh plugin --profile web add <仓库地址或本地路径>
```

在你的 profile patch 层（`$DSH_HOME/profiles/web/cordis.patch.yml`）加入插件行：

```yaml
- insert:
    - id: opencode-go-usage
      name: 'dsh-opencode-go-usage'
```

重启 `dsh web`，Host 半与客户端 bundle 即会被加载。

## 配置

Host 端可在 `cordis.yml` 的插件行上做配置：

```yaml
- id: opencode-go-usage
  name: dsh-opencode-go-usage
  config:
    baseUrl: https://opencode.ai/zen/go/v1/usage   # 默认
    timeoutMs: 15000                                # 默认
```

| 键 | 默认 | 含义 |
| --- | --- | --- |
| `baseUrl` | `https://opencode.ai/zen/go/v1/usage` | 用量接口地址。 |
| `timeoutMs` | `15000` | 请求超时（毫秒）。 |

## 用量接口

```http
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <API_KEY>
```

`<API_KEY>` 是 Anthropic 兼容的 OpenCode Go key（`sk-opencode-…`）。接口返回：

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 39, "resetsAt": "2026-08-17T12:30:33.430Z" },
    "weekly":  { "status": "ok", "percent": 15, "resetsAt": "2026-08-24T00:00:00.430Z" },
    "monthly": { "status": "ok", "percent": 13, "resetsAt": "2026-09-01T04:14:25.430Z" }
  }
}
```

`percent` 取值 0–100；`resetsAt` 为 ISO-8601。该接口尚未进入 OpenCode 官方文档。

## API Key 解析顺序

1. DSH 凭据 seam / 环境变量 `OPENCODE_GO_API_KEY` —— 也就是模型设置页写入的位置（`deriveKeyRef("opencode-go")`），所以只要在「设置 → 模型」添加了 opencode-go 就无需额外配置。
2. OpenCode `~/.local/share/opencode/auth.json` → `opencode-go` 条目（回退 `opencode`），要求 `type: "api"`。

## 原理

双端插件。Host 端发布 `opencodeUsage` Typert Remote 服务；客户端 bundle 挂载它，并通过 `/api` RPC 载体渲染 Dock 栏读数。

| 文件 | 作用 |
| --- | --- |
| `index.js` | Host 端 —— `OpencodeUsageGateway`（`TypertRemoteService`，服务键 `opencodeUsage`） |
| `typert.host.js` | 手写的 Typert host manifest，经 `exports["./typert"]` 注册 |
| `client.js` | 浏览器 bundle（`window.__ModuleLoader__.load` 格式）—— 挂载 Remote、注册 Dock 条目、渲染读数 |

## 开发

插件为纯 ESM，无构建步骤。Host 文件导入 `@deepseek-ai/*` peer；客户端 bundle 以 harness 客户端加载器在 `/plugins` 下服务的懒加载 CJS 格式手写。

## 已知局限

- 用量接口未文档化，可能变动；解析采用防御式，非 2xx 会以友好状态呈现而非崩溃。
- 限额 / 重置时间来自响应；接口漂移会被优雅处理。
- 当前供应商不是 `opencode-go` 时 Dock 完全隐藏（不显示占位提示行）。

## License

MIT
