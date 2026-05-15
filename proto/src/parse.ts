import type { z } from "zod";

export type SchemaInput<T extends z.ZodType> = z.input<T>;

export function parsePayload<T extends z.ZodType>(
  schema: T,
  data: z.input<T>,
  message = "Invalid payload",
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new Error(`${message}: ${result.error.message}`);
  }
  return result.data;
}
