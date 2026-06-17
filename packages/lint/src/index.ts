import { eslintCompatPlugin } from "@oxlint/plugins"
import { rules } from "./rules.ts"

export { lintRuleNames } from "./rule-names.ts"
export type { LintRuleName } from "./rule-names.ts"

export default eslintCompatPlugin({
  meta: { name: "lint" },
  rules,
})
