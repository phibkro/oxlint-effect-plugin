import { Effect } from "effect"

const values = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30,
]

export const effectHeavy = Effect.forEach(values, (value) =>
  Effect.succeed(value).pipe(
    Effect.map((item) => item + 1),
    Effect.flatMap((item) => Effect.succeed(item * 2)),
    Effect.map((item) => ({ item, label: `value-${item}` })),
  ),
)

export const effectHeavy2 = Effect.all({
  first: Effect.succeed(1),
  second: Effect.succeed("two"),
  third: Effect.succeed(true),
})

export { values }
