import { z } from "zod";

export const limitsSchema = z.object({
  maxChars: z.number().int().positive().max(1_000_000).default(20_000),
  maxItems: z.number().int().positive().max(10_000).default(100),
  maxDepth: z.number().int().positive().max(32).default(8),
  maxBytes: z.number().int().positive().max(100_000_000).default(10_000_000),
  pageSize: z.number().int().positive().max(1_000).default(50),
});
export type Limits = z.infer<typeof limitsSchema>;

export function boundText(value: string, maxChars: number): { value: string; truncated: boolean } {
  if (value.length <= maxChars) return { value, truncated: false };
  return { value: value.slice(0, maxChars), truncated: true };
}

export function boundItems<T>(items: T[], maxItems: number): { items: T[]; truncated: boolean } {
  return { items: items.slice(0, maxItems), truncated: items.length > maxItems };
}
