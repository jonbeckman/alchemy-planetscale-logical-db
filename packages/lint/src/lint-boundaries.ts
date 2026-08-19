import { containsNode, literalValue, memberParts, nodeChild } from "./ast.ts"
import type { NodeLike } from "./types.ts"

const effectUtilityImportSources = new Set(["effect/Clock", "effect/DateTime"])

export const isLintAllowedDynamicImportBoundary = (_filename: string): boolean => false

export const isLintAllowedBackendEffectBoundary = (_filename: string): boolean => false

function isEffectModuleSource(
  value: string | number | boolean | bigint | null | undefined,
): value is string {
  return (
    value === "effect" ||
    value === "@effect-atom/atom-react" ||
    (value !== null &&
      value !== undefined &&
      value === `${value}` &&
      value.startsWith("effect/") &&
      !effectUtilityImportSources.has(value))
  )
}

export function hasEffectSignal(program: NodeLike): boolean {
  return containsNode(program, (candidate) => {
    if (candidate.type === "ImportDeclaration") {
      const source = nodeChild(candidate, "source")
      const value = literalValue(source)
      return isEffectModuleSource(value)
    }
    const parts = memberParts(candidate)
    return parts?.[0] === "Effect" && parts.length > 1
  })
}
