// Client half of the dsh-opencode-go-usage plugin.
// Hand-written browser bundle in the lazy-CJS format the client module loader
// expects: it only REGISTERS the factory; the body runs at materialization.
// Mounts the opencodeUsage Remote and renders a live, number-only readout in
// the chat composer dock band (`conversation.composer.dock`), refreshed every
// 60 seconds. Hidden while the current model provider is not opencode-go.
window.__ModuleLoader__.load({
  id: "dsh-opencode-go-usage",
  factory: (require) => {
    const React = require("react");

    const inject = ["slots", "remote", "timer"];

    const TYPERT_REMOTE = {
      package: "dsh-opencode-go-usage",
      descriptors: [
        {
          id: "dsh-opencode-go-usage#opencodeUsage/usage",
          service: "opencodeUsage",
          namespace: "opencodeUsage",
          method: "usage",
          invocation: { kind: "direct" },
          parameters: [],
          result: {
            mode: "strict",
            typeSymbol: "dsh-opencode-go-usage#OpencodeUsageResult",
            schema: { parse(value) { return value; } },
          },
        },
      ],
    };

    const WINDOW_IDS = ["rolling", "weekly", "monthly"];
    const LABELS = { rolling: "5h", weekly: "Weekly", monthly: "Monthly" };
    const REFRESH_MS = 60000;

    const lineStyle = {
      display: "flex", alignItems: "center", gap: "14px",
      fontSize: "12px", color: "var(--dsw-alias-label-tertiary, rgba(128,128,128,0.92))",
      padding: "2px 0",
    };

    function apply(ctx) {
      const mountReady = ctx.remote.$mount(TYPERT_REMOTE);

      const query = async () => {
        await mountReady;
        const api = ctx.get("remote.opencodeUsage");
        if (!api) {
          return { enabled: false, reason: "remote-unavailable", error: null, usage: null };
        }
        const envelope = await api.usage();
        if (envelope && envelope.ok === true && envelope.value) return envelope.value;
        throw new Error((envelope && envelope.error && envelope.error.message) || "remote failed");
      };

      function Dock() {
        const [state, setState] = React.useState({ data: null });
        const load = React.useCallback(() => {
          query()
            .then(data => setState({ data }))
            .catch(() => setState({ data: { enabled: false, reason: "rpc-failed", error: "rpc-failed", usage: null } }));
        }, []);
        React.useEffect(() => {
          load();
          return ctx.interval(load, REFRESH_MS);
        }, [load]);

        const d = state.data;
        if (!d || d.enabled === false) return null;

        if (d.error) {
          const text = d.error === "no-api-key"
            ? "未设置 API key"
            : d.error === "unauthorized" ? "API key 无效"
            : d.error === "network" ? "网络失败"
            : "查询失败（" + d.error + "）";
          return React.createElement("div", { style: lineStyle, title: "OpenCode Go 用量" },
            React.createElement("span", null, "OpenCode Go"),
            React.createElement("span", { style: { color: "var(--dsw-alias-state-error-primary, rgba(229,72,77,0.9))" } }, text));
        }

        const u = d.usage || {};
        const segments = WINDOW_IDS
          .filter(id => u[id] && typeof u[id].percent === "number")
          .map(id => {
            const w = u[id];
            return React.createElement("span", {
              key: id,
              title: (LABELS[id] || id) + " 重置于 " + (w.resetsAt ? new Date(w.resetsAt).toLocaleString() : "未知"),
            }, (LABELS[id] || id) + " " + w.percent + "%");
          });
        if (segments.length === 0) return null;

        return React.createElement("div", { style: lineStyle, title: "OpenCode Go 用量（悬停见重置时间）" },
          React.createElement("span", null, "OpenCode Go"),
          segments);
      }

      ctx.slots.inject("conversation.composer.dock", () => ctx.slots.register({
        name: "conversation.composer.dock",
        id: "opencode-go-usage",
        order: 1,
      }, Dock));
    }

    return { inject, apply };
  },
});
