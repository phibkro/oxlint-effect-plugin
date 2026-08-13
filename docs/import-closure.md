# EffectTS import closure

Code: EFT5101 · Family: architecture

## Invariant

effectts-import-closure: An import edge lies outside the configured EffectTS closure.

## Why EffectTS rejects it

Governed modules may import Effect, admitted project modules, reasoned trusted pure packages, or declared adapter packages.

## Help

Move the package behind a runtime adapter, or record a reasoned trusted-pure dependency.

Proof: module-graph.

Type-only edges are admitted. Core Effect imports are admitted. Governed project edges follow the role graph. Trusted-pure packages require an exact specifier and nonempty reason. Raw package imports belong only to a runtime adapter that declares the package root.

Trust is a reviewed project assertion, not static proof of package purity.
