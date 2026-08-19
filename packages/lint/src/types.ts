import type { ESTree } from "@oxlint/plugins"

export type NodeLike = ESTree.Node

export type RuleReporter = (node: NodeLike, message?: string) => void

export type RuleRuntime = {
  report: RuleReporter
  shouldRun: () => boolean
}

export type VisitorMap = Record<string, (node: NodeLike) => void>
