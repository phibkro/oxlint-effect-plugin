---
name: effectts-programming
description: Implement and repair TypeScript inside the project's EffectTS profile.
---

# EffectTS programming

1. Read the project role, platform, boundary, and trusted-dependency configuration.
2. Use Effect as the application language; keep only total dependency-free leaf calculations as direct functions.
3. Reuse existing Effect core, platform, and unstable services before defining a project Service; a custom Service must add a domain contract or policy.
4. Express remaining dependencies and authority as Services, confine concrete runtime and vendor imports to Layer implementations, and select Layers only at composition roots.
5. Use Schema for domain and representation boundaries, Scope for lifetimes, and Effect-native modules for failure, resources, concurrency, and observability.
6. Run EffectTS enforcement and @effect/tsgo.
7. Apply only machine-applicable fixes; treat other suggestions as semantic refactors.
8. Use a narrow two-line reasoned exception only for genuine interop.

Read [references/rules.md](references/rules.md) for the stable rule codes, invariants, repairs, and proof limits.
