import type {
  EffectTSCode,
  EffectTSKnowledgeDefinition,
  EnforcementProofSource,
  Replacement,
  RuleFamily,
  RuleName,
} from "./registry.js";
import { KNOWLEDGE_INFO_BY_CODE, RULE_INFO_BY_NAME } from "./registry.js";

export interface EffectTSExplanation {
  readonly code: EffectTSCode;
  readonly subject: RuleName | "import-closure";
  readonly family: RuleFamily;
  readonly invariant: string;
  readonly summary: string;
  readonly rationale: string;
  readonly explanation: string;
  readonly help: string;
  readonly docs: string;
  readonly proofSources: readonly EnforcementProofSource[];
  readonly replacements: readonly Replacement[];
  readonly limitations: readonly string[];
  readonly typedAuthority?: string;
}

function definitionFor(query: string): EffectTSKnowledgeDefinition | null {
  const byCode = KNOWLEDGE_INFO_BY_CODE[query as EffectTSCode];
  if (byCode !== undefined) return byCode;

  const slash = query.lastIndexOf("/");
  const candidate = (slash === -1 ? query : query.slice(slash + 1)) as RuleName;
  return RULE_INFO_BY_NAME[candidate] ?? null;
}

/** Resolve stable EffectTS knowledge without filesystem or runtime authority. */
export function explainEffectTS(query: string): EffectTSExplanation | null {
  const definition = definitionFor(query.trim());
  if (definition === null) return null;
  const ruleDefinition = "rule" in definition ? definition : null;
  return {
    code: definition.code,
    subject: ruleDefinition?.rule ?? "import-closure",
    family: definition.family,
    invariant: definition.invariant,
    summary: definition.summary,
    rationale: definition.rationale,
    explanation: definition.diagnostic.explanation,
    help: definition.diagnostic.help,
    docs: definition.diagnostic.docs,
    proofSources: definition.proofSources,
    replacements: definition.replacements,
    limitations: definition.limitations,
    ...(ruleDefinition === null ? {} : { typedAuthority: ruleDefinition.tsgo.authority }),
  };
}
