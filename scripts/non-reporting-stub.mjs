const emptyRule = {
  meta: {
    type: "problem",
    docs: { description: "Non-reporting observed-red oracle stub." },
    schema: [{ type: "object", additionalProperties: true }],
  },
  create() {
    return {};
  },
};

export default {
  meta: { name: "effect-stub", version: "0" },
  rules: {
    "no-ambient-console": emptyRule,
    "no-ambient-authority": emptyRule,
    "no-cross-runtime": emptyRule,
    "no-premature-execution": emptyRule,
    "no-native-promise-control-flow": emptyRule,
    "no-raw-json-parse": emptyRule,
    "no-untyped-throw": emptyRule,
  },
};
