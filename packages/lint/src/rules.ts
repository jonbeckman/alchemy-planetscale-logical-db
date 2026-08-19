import type { Rule } from "@oxlint/plugins"
import {
  bareErrorConstructors,
  callArguments,
  effectCallMethod,
  findDescendant,
  firstNestedEffectCall,
  functionBody,
  hasCallbackReturning,
  hasEffectCall,
  hasNullishUnionMember,
  hasSequencingCall,
  hasSideEffectCall,
  isBranchCall,
  isCallExpression,
  isCallTo,
  isConsoleCall,
  isEffectCall,
  isEffectMember,
  isEffectVoid,
  isIife,
  isInsideEffectHandler,
  isMatchValuePipe,
  isNode,
  isNodeType,
  isNullableLocalOrReturnType,
  isPipeCall,
  isSchemaFilterCall,
  nodeChild,
  nodeChildren,
  parentCall,
  propertyKeyName,
  propertyValue,
  returnStatements,
  typeNameText,
} from "./ast.ts"
import { isLintAllowedDynamicImportBoundary } from "./lint-boundaries.ts"
import { defineLintRule } from "./make-rule.ts"
import type { LintRuleName } from "./rule-names.ts"
import type { NodeLike } from "./types.ts"

export const rules = {
  "no-if-statement": defineLintRule("no-if-statement", ({ report, shouldRun }) => ({
    IfStatement(node) {
      if (shouldRun()) {
        report(nodeChild(node, "test") ?? node)
      }
    },
  })),
  "no-ternary": defineLintRule("no-ternary", ({ report, shouldRun }) => ({
    ConditionalExpression(node) {
      if (shouldRun()) {
        report(nodeChild(node, "test") ?? node)
      }
    },
  })),
  "no-pipe-ladder": defineLintRule("no-pipe-ladder", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun() || !isPipeCall(node)) {
        return
      }
      const nested = callArguments(node)
        .map((argument) => findDescendant(argument, isPipeCall))
        .find(isNode)
      if (nested) {
        report(nested)
      }
    },
  })),
  "no-flatmap-ladder": defineLintRule("no-flatmap-ladder", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun()) {
        return
      }
      if (
        isEffectCall(node, "flatMap") &&
        callArguments(node).some((argument) => hasEffectCall(argument, "flatMap"))
      ) {
        report(node)
      }
      if (
        isEffectCall(node, "flatten") &&
        callArguments(node).some((argument) => hasEffectCall(argument, "map"))
      ) {
        report(
          node,
          "Rule: avoid map+flatten ladders. Why: they hide sequencing. Fix: build context once (Effect.all/Effect.map) and run a single flatMap.",
        )
      }
    },
  })),
  "no-effect-ladder": defineLintRule("no-effect-ladder", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun() || !isEffectCall(node)) {
        return
      }
      const firstArgument = callArguments(node)[0]
      if (isEffectCall(firstArgument) && firstNestedEffectCall(firstArgument)) {
        report(node)
      }
    },
  })),
  "no-effect-call-in-effect-arg": defineLintRule(
    "no-effect-call-in-effect-arg",
    ({ report, shouldRun }) => ({
      CallExpression(node) {
        if (
          shouldRun() &&
          isEffectCall(node) &&
          callArguments(node).some((argument) => isEffectCall(argument))
        ) {
          report(node)
        }
      },
    }),
  ),
  "no-nested-effect-call": defineLintRule("no-nested-effect-call", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun() || !isEffectCall(node)) {
        return
      }
      const firstArgument = callArguments(node)[0]
      if (isEffectCall(firstArgument) && firstNestedEffectCall(firstArgument)) {
        report(node)
      }
    },
  })),
  "no-effect-as": defineLintRule("no-effect-as", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (shouldRun() && isEffectCall(node, "as")) {
        report(node)
      }
    },
  })),
  "no-call-tower": defineLintRule("no-call-tower", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (
        shouldRun() &&
        isEffectCall(node) &&
        callArguments(node).some((argument) => isEffectCall(argument))
      ) {
        report(node)
      }
    },
  })),
  "no-option-as": defineLintRule("no-option-as", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (shouldRun() && isCallTo(node, "Option", "as")) {
        report(node)
      }
    },
  })),
  "no-arrow-ladder": defineLintRule("no-arrow-ladder", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun() || !isIife(node)) {
        return
      }
      const nested = findDescendant(
        functionBody(nodeChild(node, "callee")),
        (candidate) => candidate !== node && isIife(candidate),
      )
      if (nested) {
        report(nested)
      }
    },
  })),
  "no-branch-in-object": defineLintRule("no-branch-in-object", ({ report, shouldRun }) => ({
    ObjectExpression(node) {
      if (!shouldRun()) {
        return
      }
      for (const property of nodeChildren(node, "properties")) {
        const value = nodeChild(property, "value")
        if (value && isBranchCall(value)) {
          report(value)
          return
        }
      }
    },
  })),
  "no-iife-wrapper": defineLintRule("no-iife-wrapper", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (shouldRun() && isIife(node)) {
        report(node)
      }
    },
  })),
  "no-return-in-arrow": defineLintRule("no-return-in-arrow", ({ report, shouldRun }) => ({
    ArrowFunctionExpression(node) {
      if (!shouldRun() || !isNodeType(functionBody(node), "BlockStatement")) {
        return
      }
      const call = parentCall(node)
      if (isSchemaFilterCall(call)) {
        return
      }
      const returned = returnStatements(functionBody(node))[0]
      if (returned) {
        report(returned)
      }
    },
  })),
  "no-effect-never": defineLintRule("no-effect-never", ({ report, shouldRun }) => ({
    MemberExpression(node) {
      if (shouldRun() && isEffectMember(node, "never")) {
        report(node)
      }
    },
    StaticMemberExpression(node) {
      if (shouldRun() && isEffectMember(node, "never")) {
        report(node)
      }
    },
  })),
  "no-effect-async": defineLintRule("no-effect-async", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (shouldRun() && isEffectCall(node, "async")) {
        report(node)
      }
    },
  })),
  "no-effect-do": defineLintRule("no-effect-do", ({ report, shouldRun }) => ({
    MemberExpression(node) {
      if (shouldRun() && isEffectMember(node, "Do")) {
        report(node)
      }
    },
    StaticMemberExpression(node) {
      if (shouldRun() && isEffectMember(node, "Do")) {
        report(node)
      }
    },
  })),
  "no-effect-bind": defineLintRule("no-effect-bind", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (shouldRun() && isEffectCall(node, "bind")) {
        report(node)
      }
    },
  })),
  "no-nested-effect-gen": defineLintRule("no-nested-effect-gen", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun() || !isEffectCall(node, "gen")) {
        return
      }
      const nested = callArguments(node)
        .map((argument) =>
          findDescendant(
            argument,
            (candidate) => candidate !== node && isEffectCall(candidate, "gen"),
          ),
        )
        .find(isNode)
      if (nested) {
        report(nested)
      }
    },
  })),
  "no-match-void-branch": defineLintRule("no-match-void-branch", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (
        !shouldRun() ||
        (!isCallTo(node, "Match", "when") && !isCallTo(node, "Match", "orElse"))
      ) {
        return
      }
      const args = callArguments(node)
      const callback = args.at(-1)
      if (hasCallbackReturning(callback, isEffectVoid)) {
        report(node)
      }
    },
  })),
  "no-match-effect-branch": defineLintRule("no-match-effect-branch", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun()) {
        return
      }
      if (
        isMatchValuePipe(node) &&
        callArguments(node).some((argument) => hasSequencingCall(argument))
      ) {
        report(node)
      }
      if (
        (isCallTo(node, "Match", "when") || isCallTo(node, "Match", "orElse")) &&
        callArguments(node).some((argument) => hasSequencingCall(argument))
      ) {
        report(node)
      }
      if (
        isCallTo(node, "Option", "match") &&
        callArguments(node).some((argument) => hasSequencingCall(argument))
      ) {
        report(node)
      }
    },
  })),
  "warn-effect-sync-wrapper": defineLintRule(
    "warn-effect-sync-wrapper",
    ({ report, shouldRun }) => ({
      CallExpression(node) {
        if (!shouldRun() || !isEffectCall(node, "sync")) {
          return
        }
        const firstArgument = callArguments(node)[0]
        if (
          hasCallbackReturning(
            firstArgument,
            (body) => isCallExpression(body) && !isConsoleCall(body),
          )
        ) {
          report(node)
        }
      },
    }),
  ),
  "no-effect-side-effect-wrapper": defineLintRule(
    "no-effect-side-effect-wrapper",
    ({ report, shouldRun }) => ({
      CallExpression(node) {
        if (!shouldRun() || (!isEffectCall(node, "as") && !isEffectCall(node, "zipRight"))) {
          return
        }
        if (hasSideEffectCall(callArguments(node)[0])) {
          report(node)
        }
      },
    }),
  ),
  "no-effect-orElse-ladder": defineLintRule("no-effect-orElse-ladder", ({ report, shouldRun }) => ({
    CallExpression(node) {
      if (!shouldRun() || !isEffectCall(node, "orElse")) {
        return
      }
      const firstArgument = callArguments(node)[0]
      if (
        hasEffectCall(firstArgument, "flatMap") ||
        hasEffectCall(firstArgument, "zipRight") ||
        hasEffectCall(firstArgument, "as") ||
        hasEffectCall(firstArgument, "tap")
      ) {
        report(node)
      }
    },
  })),
  "no-return-in-callback": defineLintRule("no-return-in-callback", ({ report, shouldRun }) => ({
    ArrowFunctionExpression(node) {
      if (!shouldRun() || !isNodeType(functionBody(node), "BlockStatement")) {
        return
      }
      const call = parentCall(node)
      if (isSchemaFilterCall(call)) {
        return
      }
      const returned = returnStatements(functionBody(node))[0]
      if (returned) {
        report(returned)
      }
    },
  })),
  "no-manual-effect-channels": defineLintRule(
    "no-manual-effect-channels",
    ({ report, shouldRun }) => ({
      TSTypeReference(node) {
        if (!shouldRun()) {
          return
        }
        const typeName = typeNameText(nodeChild(node, "typeName"))
        if (typeName === "Effect.Effect" || typeName === "Layer.Layer") {
          report(node)
        }
      },
    }),
  ),
  "prevent-dynamic-imports": defineLintRule(
    "prevent-dynamic-imports",
    ({ report }, context) => ({
      ImportExpression(node) {
        if (isLintAllowedDynamicImportBoundary(context.filename)) {
          return
        }
        report(node)
      },
    }),
    { requiresEffectFile: false },
  ),
  "prefer-option-over-null": defineLintRule("prefer-option-over-null", ({ report, shouldRun }) => ({
    TSUnionType(node) {
      if (shouldRun() && hasNullishUnionMember(node) && isNullableLocalOrReturnType(node)) {
        report(node)
      }
    },
  })),
  "avoid-untagged-errors": defineLintRule("avoid-untagged-errors", ({ report, shouldRun }) => {
    const reported = new Set<NodeLike>()
    const reportBareErrors = (node: NodeLike | undefined) => {
      if (!shouldRun()) {
        return
      }
      for (const errorNode of bareErrorConstructors(node)) {
        if (!reported.has(errorNode)) {
          reported.add(errorNode)
          report(errorNode)
        }
      }
    }

    return {
      CallExpression(node) {
        if (!shouldRun()) {
          return
        }

        const method = effectCallMethod(node)
        if (method === "fail" || method === "mapError") {
          for (const argument of callArguments(node)) {
            reportBareErrors(argument)
          }
          return
        }

        if (method !== "try" && method !== "tryPromise") {
          return
        }

        for (const argument of callArguments(node)) {
          if (argument.type !== "ObjectExpression") {
            continue
          }
          for (const property of nodeChildren(argument, "properties")) {
            if (propertyKeyName(property) === "catch") {
              reportBareErrors(propertyValue(property))
            }
          }
        }
      },
      ThrowStatement(node) {
        if (!shouldRun() || !isInsideEffectHandler(node)) {
          return
        }
        reportBareErrors(nodeChild(node, "argument"))
      },
    }
  }),
} satisfies Record<LintRuleName, Rule>
