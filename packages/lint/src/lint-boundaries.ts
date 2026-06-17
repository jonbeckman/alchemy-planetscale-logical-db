import { containsNode, literalValue, memberParts, nodeChild } from "./ast.ts"
import type { NodeLike } from "./types.ts"

const effectUtilityImportSources = new Set(["effect/Clock", "effect/DateTime"])

export const isLintAllowedDynamicImportBoundary = (_filename: string): boolean => false

export const isLintAllowedBackendEffectBoundary = (_filename: string): boolean => false

export function hasEffectSignal(program: NodeLike): boolean {
  return containsNode(program, (candidate) => {
    if (candidate.type === "ImportDeclaration") {
      const source = nodeChild(candidate, "source")
      const value = literalValue(source)
      return (
        value === "effect" ||
        value === "@effect-atom/atom-react" ||
        (typeof value === "string" &&
          value.startsWith("effect/") &&
          !effectUtilityImportSources.has(value))
      )
    }
    const parts = memberParts(candidate)
    return parts?.[0] === "Effect" && parts.length > 1
  })
}
