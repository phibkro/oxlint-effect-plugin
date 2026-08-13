---
name: effectts-programming
description: Implement and repair TypeScript inside the project's EffectTS profile.
---

# EffectTS programming

1. Read the project role, platform, boundary, and trusted-dependency configuration.
2. Keep pure local computation as plain TypeScript.
3. Use Effect for effectful computation, Schema for domain and representation boundaries, services for capabilities, Layers for implementations, and Scope for lifetimes.
4. Run EffectTS enforcement and @effect/tsgo.
5. Apply only machine-applicable fixes; treat other suggestions as semantic refactors.
6. Use a narrow two-line reasoned exception only for genuine interop.

Read [references/rules.md](references/rules.md) for the stable rule codes, invariants, repairs, and proof limits.
