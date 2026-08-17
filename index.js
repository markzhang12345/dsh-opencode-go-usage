// Host half of the dsh-opencode-go-usage plugin.
// Publishes the "opencodeUsage" Cordis service (a Typert Remote) whose
// usage() method is callable from the browser dock widget over the /api RPC
// carrier. Auth is wired by typert.host.js, so no @Remote decorator is needed.
import z from "@deepseek-ai/schemastery";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";

const DEFAULT_BASE_URL = "https://opencode.ai/zen/go/v1/usage";
const DEFAULT_TIMEOUT_MS = 15000;

export const Config = z.object({
  baseUrl: z.string().default(DEFAULT_BASE_URL),
  timeoutMs: z.number().default(DEFAULT_TIMEOUT_MS),
});

/**
 * Resolve the OpenCode Go API key, most-trusted first:
 *   1. DSH credentials / env reference OPENCODE_GO_API_KEY
 *      (covers ~/.dsh/.credentials.yaml and the process environment)
 *   2. OpenCode's own auth.json: opencode-go (fallback opencode) type=api key
 */
async function resolveApiKey(ctx) {
  try {
    const cred = await ctx.credentials.resolve(credentialRef("OPENCODE_GO_API_KEY"));
    if (cred && cred.value) return cred.value;
  } catch {
    /* fall through */
  }
  try {
    const authPath = join(process.env.HOME || process.env.USERPROFILE || "/", ".local", "share", "opencode", "auth.json");
    const parsed = JSON.parse(await readFile(authPath, "utf8"));
    const entry = parsed["opencode-go"] ?? parsed.opencode;
    if (entry && entry.type === "api" && typeof entry.key === "string" && entry.key.length > 0) {
      return entry.key;
    }
  } catch {
    /* fall through */
  }
  return undefined;
}

function pickWindow(w) {
  if (!w || typeof w !== "object") return null;
  const percent = typeof w.percent === "number" ? w.percent : Number(w.percent);
  return {
    status: typeof w.status === "string" ? w.status : null,
    percent: Number.isFinite(percent) ? percent : null,
    resetsAt: typeof w.resetsAt === "string" ? w.resetsAt : null,
  };
}

export class OpencodeUsageGateway extends TypertRemoteService {
  static inject = ["credentials", "settings"];
  static Config = Config;

  constructor(ctx, config) {
    super(ctx, "opencodeUsage");
    this.config = config ?? {};
  }

  async usage() {
    const baseUrl = this.config.baseUrl || DEFAULT_BASE_URL;
    const timeoutMs = this.config.timeoutMs || DEFAULT_TIMEOUT_MS;

    // Per-session visibility is owned by each dock widget on the client (it
    // reads its own session's model directory). This host method only resolves
    // the key and fetches the session-agnostic usage data.
    const apiKey = await resolveApiKey(this.ctx);
    if (!apiKey) {
      return { enabled: true, reason: null, error: "no-api-key", usage: null };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(baseUrl, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
        signal: controller.signal,
      });
    } catch {
      return { enabled: true, reason: null, error: "network", usage: null };
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 401) {
      return { enabled: true, reason: null, error: "unauthorized", usage: null };
    }
    if (!res.ok) {
      return { enabled: true, reason: null, error: `http-${res.status}`, usage: null };
    }

    let body;
    try {
      body = await res.json();
    } catch {
      return { enabled: true, reason: null, error: "bad-json", usage: null };
    }

    const usage = body && typeof body === "object" && body.usage ? body.usage : body;
    return {
      enabled: true,
      reason: null,
      error: null,
      usage: {
        rolling: pickWindow(usage.rolling),
        weekly: pickWindow(usage.weekly),
        monthly: pickWindow(usage.monthly),
      },
    };
  }
}

export default OpencodeUsageGateway;
