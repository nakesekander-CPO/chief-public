export const modelConfig = {
  reasoning: process.env.MODEL_REASONING ?? 'gpt-5.6-sol',
  fast: process.env.MODEL_FAST ?? 'gpt-5.6-luna',
  extraction: process.env.MODEL_EXTRACTION ?? 'gpt-5.6-terra',
  embedding: process.env.MODEL_EMBEDDING ?? 'text-embedding-3-small',
  transcription: process.env.MODEL_TRANSCRIPTION ?? 'gpt-transcribe',
  maxTurns: Number(process.env.MODEL_MAX_TURNS ?? 4),
  maxToolCalls: Number(process.env.MODEL_MAX_TOOL_CALLS ?? 6),
  requestTimeoutMs: Number(process.env.MODEL_TIMEOUT_MS ?? 45_000),
  dailyBudgetUsd: Number(process.env.MODEL_DAILY_BUDGET_USD ?? 5),
} as const;

export type ModelRole = keyof Pick<typeof modelConfig, 'reasoning' | 'fast' | 'extraction' | 'embedding' | 'transcription'>;
