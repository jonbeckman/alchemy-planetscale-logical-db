import { defineRule } from "@oxlint/plugins"
import type { Context, Rule, Visitor } from "@oxlint/plugins"
import {
  hasEffectSignal,
  isLintAllowedBackendEffectBoundary,
  isLintRequestObservabilitySurface,
} from "./lint-boundaries.ts"
import { messages } from "./messages.ts"
import type { LintRuleName } from "./rule-names.ts"
import type { NodeLike, RuleReporter, RuleRuntime, VisitorMap } from "./types.ts"

export function makeRule(
  name: LintRuleName,
  createVisitors: (runtime: RuleRuntime, context: Context) => VisitorMap,
  options: {
    description?: string
    requiresEffectFile?: boolean
    requiresLintRequestObservabilitySurface?: boolean
  } = {},
): Rule {
  const requiresEffectFile = options.requiresEffectFile ?? true
  const requiresLintRequestObservabilitySurface =
    options.requiresLintRequestObservabilitySurface ?? false
  return defineRule({
    meta: {
      type: "suggestion",
      docs: {
        description: options.description ?? messages[name],
      },
      schema: [],
    },
    createOnce(context: Context) {
      let effectFile = false
      let matchingFile = false
      const report: RuleReporter = (node, message = messages[name]) => {
        context.report({ node, message })
      }
      const runtime: RuleRuntime = {
        report,
        shouldRun: () => matchingFile && (!requiresEffectFile || effectFile),
      }
      return {
        before() {
          effectFile = false
          const allowedBackendBoundary = isLintAllowedBackendEffectBoundary(context.filename)
          matchingFile =
            !allowedBackendBoundary &&
            (!requiresLintRequestObservabilitySurface ||
              isLintRequestObservabilitySurface(context.filename))
        },
        Program(node: NodeLike) {
          effectFile = hasEffectSignal(node)
        },
        ...createVisitors(runtime, context),
      } as unknown as Visitor
    },
  })
}
