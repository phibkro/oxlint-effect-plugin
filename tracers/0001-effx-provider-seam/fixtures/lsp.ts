import { Effect } from "effect"

/* probe:lsp-floating */
Effect.succeed(1)

export const stockNumber: number = "stock diagnostic preserved"
export const program = Effect.succeed(stockNumber)
