import { containsNode, literalValue, memberParts, nodeChild } from "./ast.ts"
import type { NodeLike } from "./types.ts"

const effectUtilityImportSources = new Set(["effect/Clock", "effect/DateTime"])

export function isLintRequestObservabilitySurface(filename: string): boolean {
  const normalized = filename.replaceAll("\\", "/")
  return (
    /\/apps\/[^/]+\/src\/api\.[cm]?[jt]sx?$/.test(normalized) ||
    /\/apps\/[^/]+\/src\/server(?:\/|$)/.test(normalized) ||
    normalized.endsWith("/packages/utils/src/observability.ts")
  )
}

export function isLintAllowedDynamicImportBoundary(filename: string): boolean {
  const normalized = filename.replaceAll("\\", "/")
  return normalized.endsWith("/apps/gtt-web/src/browser-automation-modules.ts")
}

export function isLintAllowedBackendEffectBoundary(filename: string): boolean {
  const normalized = filename.replaceAll("\\", "/")
  return (
    normalized.endsWith("/apps/gtt-web/src/api.ts") ||
    normalized.endsWith("/apps/solzero-web/src/api.ts") ||
    normalized.endsWith("/apps/gtt-web/src/server/ws.ts") ||
    normalized.endsWith("/apps/gtt-web/src/server/api/services/automation/browser-runners.ts") ||
    normalized.endsWith("/apps/gtt-web/src/server/api/services/automation/chronogolf.ts")
  )
}

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
