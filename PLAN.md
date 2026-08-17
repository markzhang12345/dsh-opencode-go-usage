# PLAN：OpenCode Go 用量插件 —— 按"当前会话"启用

> 状态：**待审批**。未执行。
> 目标：Dock 栏只在**当前会话**的模型供应商为 `opencode-go` 时显示；不同会话各自独立判断。

## 1. 背景与问题

当前永久版（`ocgu` → 后打包成 `dsh-opencode-go-usage`）的启用判定在 **Host 端**：

- Host `OpencodeUsageGateway.usage()` 调用 `ctx.agentDefaultModel.currentSelection().provider`，读的是**全局"默认模型"**的供应商，**与具体会话无关**。
- 当两个会话（一个供应商是 opencode-go、一个不是）并存时，两个 Dock 栏都走同一个 Host 判定 → **要么都显示、要么都隐藏**，取决于全局默认。这不符合"按会话判断"的预期。

## 2. 关键结论（已取证）

- **每个会话的当前模型/供应商**在客户端有权威来源：
  `ctx.modelDirectories.directoryFor(sessionId).store` 的 snapshot `.current` = `{ provider, model, reasoningEffort }`（`ModelSelection | null`）。
  该 service 由 `ui-model-selection` 提供（`ctx.modelDirectories`），且**模型切换时自动刷新**（监听 `llm/adapters-updated`、`settings/document-updated`）。模型选择 UI 就是用它显示"当前"选中项。
- Dock Slot（`conversation.composer.dock`）是 **session scope**，组件 props 里有 `sessionId`（`standardProps: [useSession, sessionId, useProjection, useInput, inputActions]`）。
- 所以"按会话判断"应**在 client 端做**，Host 保持会话无关。

## 3. 设计方案

### 3.1 架构调整：判定从 Host 移到 Client

| 现状（要改） | 目标 |
| --- | --- |
| Host `usage()` 用 `agentDefaultModel` 判 provider，非 opencode-go 时回 `enabled:false` | Host **不再**做 provider 门控；`usage()` 只负责"key + 拉接口"，返回 `{ enabled:true, provider?, error?, usage }` |
| Client Dock 用 Host 返回的 `enabled` 决定显隐 | Client Dock **用本会话 directory 的 `current.provider`** 决定显隐，再调用 Host 取数据 |

**理由**：Dock 是 session scope，天然按会话渲染；Host 的 Remote 不携带 session 上下文，按会话判断放 client 最自然且无需改 RPC 契约。

### 3.2 各半改动

**Host（`index.js`）**
- 删除 `currentProvider()` 对 `agentDefaultModel` 的门控分支；`usage()` 不再回 `provider-not-opencode-go`。
- 保留：key 解析（credentials `OPENCODE_GO_API_KEY` → auth.json）、`fetch` 拉接口、窗口组装。
- `inject` 从 `["credentials","settings","agentDefaultModel"]` 收窄为 `["credentials","settings"]`（去掉 agentDefaultModel 依赖，避免无谓的激活等待）。
- 返回形态：`{ enabled: true, error, usage }`（`enabled` 恒 true 或保留用于错误占位，详加定夺；建议保留 `enabled:true` 字段向后兼容，错误时 `error` 非 null）。

**Client（`client.js`）**
- 注入面新增 `modelDirectories`：`inject: ['slots','remote','timer','modelDirectories']`。
- Dock 组件：
  - 从 props 取 `sessionId`（session-scope standard props）。
  - 在 `apply`/组件里 `const dir = ctx.modelDirectories.directoryFor(sessionId)`，订阅 `dir.store`（用 `useStore` 或框架提供的订阅方式；若无可订阅钩子，则在 load 时读一次 `dir.store.getSnapshot().current` + 依赖 60s 轮询重读，或监听 directory 刷新事件）。
  - 仅当 `snapshot.current?.provider === 'opencode-go'` 时渲染用量行，否则 `return null`。
  - 取数逻辑（Remote 调用 + 60s interval）不变；启用判定换成会话级 provider。
- 判定读取的两种方式（PLAN 里二选一，实施时定）：
  - **A（推荐）**：直接读 `directory.store.getSnapshot().current`，并在 60s 轮询里重读；模型切换后下一次轮询即生效（最多延迟 60s）。实现简单、风险低。
  - **B**：订阅 directory store 变化即时重渲染（若存在框架钩子，比如 directory 本身已给 store，可用 createSnapshotStore 的订阅；需确认 dock 组件是否能用 `useStore`）。即时性最好但实现更复杂。
  - 折中：A 为主，且 directory 的 service 本来就在 `llm/adapters-updated`/`settings/document-updated` 时自动 `load()` 刷新 `current`，所以 A 的延迟只受轮询间隔影响。

### 3.3 模型工具 `opencode_go_usage` 的处理（开放点，需定）

该工具是 Host 端动态工具，当前也按 `agentDefaultModel` 判定。按"当前会话"语义，工具的判定应反映**调用它的那个 Agent 会话**的供应商。两个选项：

- **方案 1（推荐）**：工具的 provider 门控改为读取**调用者会话**的当前选择。Host 工具 `execute(args, exec)` 的 `exec` 里可能带 `agent.session`（类似 bash 工具 `resolveSandboxPolicy(exec.agent.session)`）；若有，则按该会话的模型目录/选择判定。实施时先确认 `exec.agent.session` 可用。
- **方案 2**：工具不再按 provider 门控（仅按 key 是否存在判定），由模型自行决定何时问它。简单，但"自动启用"语义会弱化。
- **方案 3**：保持现状（全局默认）——与 Dock 的会话化不一致，不推荐。

**建议**：实施时先查 `exec.agent.session` 是否可取当前会话的选择；能取则方案 1，否则退方案 2。

## 4. 实施步骤（审批通过后）

1. 修 Host `index.js`：去 provider 门控、`inject` 收窄、`node --check`。
2. 修 Client `client.js`：加 `modelDirectories`、按会话判定显隐、`node --check`。
3. 定模型工具方案（1/2），相应改 Host。
4. 更新 `README.md` / `README.zh.md` 的"自动启用"描述与"原理"表。
5. 本地重装：`dsh plugin --profile web add file:...`（pnpm 重装 file 依赖）、patch 行不变。
6. **重启 `dsh web` 验证**：开两个会话（一个 opencode-go、一个非），确认 Dock 各自正确显隐、数字正常、悬停重置时间、60s 刷新。
7. 提交 commit；确认无误后 push。

## 5. 风险与注意

| 风险 | 说明 / 对策 |
| --- | --- |
| `modelDirectories` 在我的 client 上下文是否可直接 `ctx.get`/inject | 由 `ui-model-selection` 提供为 service；跨插件 `ctx.get('modelDirectories')` 是官方允许的途径。但注入顺序/激活时序需运行时验证；若 dock 渲染早于 service 就绪，用 `ctx.inject(['modelDirectories'], cb)` 更稳。 |
| directory store 的订阅方式 | 方案 A 靠轮询重读规避订阅问题；若要用 `useStore`，需确认 dock 组件可用的钩子（slot props 的 standard props 未直接给 directory store）。 |
| Host `usage()` 去门控后被任意会话调用 | 数据本身是会话无关的用量，去门控无安全顾虑；仅行为上"非 opencode-go 会话也能取到数"，而 client 已按会话隐藏，不影响 UI。 |
| 模型工具的会话上下文 | `exec.agent.session` 是否可取待验证；取不到则退方案 2（不按 provider 门控）。 |
| 验证仍需重启 | 重启 GUI 后本动态会话上下文会丢失，需重新确认。 |

## 6. 影响范围

- 仅本插件两个文件（`index.js` Host、`client.js` Client）+ README 两份 + 可能的一处工具逻辑。
- 不动 deepseek-harness 源码、不动 host composition 其他行、不动 profile 其他依赖。
