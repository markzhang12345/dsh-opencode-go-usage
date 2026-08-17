// Host Typert manifest for the opencodeUsage Remote. The typert-loader imports
// this via package.json exports["./typert"] and registers it into ctx.typert,
// so the Host gateway claims and dispatches "opencodeUsage/usage" in strict
// mode. Schema mirrors the result returned by OpencodeUsageGateway.usage().
import { z } from "zod";

const windowSchema = z.object({
  status: z.string().nullable(),
  percent: z.number().nullable(),
  resetsAt: z.string().nullable(),
});

const resultSchema = z.object({
  enabled: z.boolean(),
  provider: z.string(),
  reason: z.string().nullable(),
  error: z.string().nullable(),
  usage: z.object({
    rolling: windowSchema.nullable(),
    weekly: windowSchema.nullable(),
    monthly: windowSchema.nullable(),
  }).nullable(),
});

export const TYPERT = {
  package: "dsh-opencode-go-usage",
  face: "host",
  schemas: [],
  invocations: [
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
        schema: resultSchema,
      },
    },
  ],
  model: { services: [], events: [], objects: [] },
};
