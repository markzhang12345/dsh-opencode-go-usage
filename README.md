# dsh-opencode-go-usage

[English](README.md) | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) web plugin that shows your **OpenCode Go** coding-plan usage as a live, number-only readout in the chat composer dock — `OpenCode Go  5h 39%  Weekly 15%  Monthly 13%` — refreshed every 60 seconds. It auto-enables **per session**: each session's widget renders only while that session's model provider is `opencode-go`, and hides otherwise.

## Features

- Live readout in the chat composer dock band (`conversation.composer.dock`): 5h rolling / weekly / monthly percentages with reset times on hover
- Refreshes every 60s
- Auto-enabled **per session**: each chat session's widget shows only when that session's model provider is `opencode-go` (independent across concurrent sessions)
- No progress bars, plain numbers only

## Install

In your `dsh` profile (here `web`):

```sh
dsh plugin --profile web add <this-repo-uri-or-file-path>
```

Add the plugin row to your profile's patch layer (`$DSH_HOME/profiles/web/cordis.patch.yml`):

```yaml
- insert:
    - id: opencode-go-usage
      name: 'dsh-opencode-go-usage'
```

Restart `dsh web` so the host half and the served client bundle are picked up.

## Configuration

Host-side tunables live on the plugin row in `cordis.yml`:

```yaml
- id: opencode-go-usage
  name: dsh-opencode-go-usage
  config:
    baseUrl: https://opencode.ai/zen/go/v1/usage   # default
    timeoutMs: 15000                                # default
```

| Key | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://opencode.ai/zen/go/v1/usage` | The usage endpoint. |
| `timeoutMs` | `15000` | Fetch timeout in milliseconds. |

## The usage endpoint

```http
GET https://opencode.ai/zen/go/v1/usage
Authorization: Bearer <API_KEY>
```

`<API_KEY>` is the Anthropic-compatible OpenCode Go key (`sk-opencode-…`). The endpoint returns:

```json
{
  "usage": {
    "rolling": { "status": "ok", "percent": 39, "resetsAt": "2026-08-17T12:30:33.430Z" },
    "weekly":  { "status": "ok", "percent": 15, "resetsAt": "2026-08-24T00:00:00.430Z" },
    "monthly": { "status": "ok", "percent": 13, "resetsAt": "2026-09-01T04:14:25.430Z" }
  }
}
```

`percent` is 0–100; `resetsAt` is ISO-8601. The endpoint is not yet in OpenCode's public docs.

## API key resolution order

1. DSH credentials seam / environment `OPENCODE_GO_API_KEY` — also what the models page fills in (`deriveKeyRef("opencode-go")`), so no extra setup is needed when opencode-go is added under Settings → Models.
2. OpenCode `~/.local/share/opencode/auth.json` → the `opencode-go` entry (fallback `opencode`) with `type: "api"`.

## How it works

A dual-face plugin. The host half publishes the `opencodeUsage` Typert Remote service (it only resolves the key and fetches the session-agnostic usage data); the client bundle mounts it and renders the dock readout over the `/api` RPC carrier. Per-session visibility is decided on the client: each dock widget reads its own session's model directory (`ctx.modelDirectories`) and hides unless that session's provider is `opencode-go`.

| File | Role |
| --- | --- |
| `index.js` | Host half — `OpencodeUsageGateway` (`TypertRemoteService`, service key `opencodeUsage`) |
| `typert.host.js` | Hand-written Typert host manifest, registered via `exports["./typert"]` |
| `client.js` | Browser bundle in `window.__ModuleLoader__.load` format — mounts the Remote, registers the dock entry, renders the readout |

## Development

The plugin is plain ESM, no build step. Host files import `@deepseek-ai/*` peers; the client bundle is hand-written in the lazy-CJS format the harness client loader serves under `/plugins`.

## Known limitations

- The usage endpoint is undocumented and may change; parsing is defensive and non-200 responses surface as a friendly status rather than a crash.
- Quota limits / reset times come from the response; endpoint drift is handled gracefully.
- The dock widget is hidden entirely while the current provider is not `opencode-go` (no placeholder line).

## License

MIT
