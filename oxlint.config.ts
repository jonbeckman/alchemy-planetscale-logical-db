import { defineConfig } from "oxlint"
import { agentToolIgnorePatterns, effectRules, recommended } from "oxlint-plugin-solzero/config"

const effectPluginRules = [
  "avoid-try-catch",
  "prefer-match-over-switch",
  "imperative-loops",
  "avoid-data-tagged-error",
  "avoid-direct-json",
  "avoid-option-getorthrow",
  "avoid-process-env",
  "effect-run-in-body",
  "effect-promise-vs-trypromise",
  "use-filesystem-service",
  "use-path-service",
  "avoid-platform-coupling",
  "avoid-node-imports",
  "avoid-any",
  "avoid-object-type",
  "avoid-ts-ignore",
  "avoid-mutable-state",
  "avoid-schema-suffix",
  "avoid-non-null-assertion",
  "use-clock-service",
  "avoid-sync-fs",
  "prefer-arr-sort",
  "context-tag-extends",
  "throw-in-effect-gen",
  "prefer-effect-fn",
  "yield-in-for-loop",
  "avoid-expect-in-if",
  "avoid-yield-ref",
  "effect-catchall-default",
  "avoid-direct-tag-checks",
  "avoid-native-object-helpers",
  "prefer-namespace-imports",
  "prefer-effect-is",
  "prefer-duration-constructors",
  "prefer-arr-match",
  "prefer-redacted-config",
  "require-schema-type-alias",
  "require-filter-metadata",
  "require-effect-concurrency",
  "no-barrel-imports",
  "no-opaque-instance-fields",
]

export default defineConfig({
  extends: [recommended],
  // A disable comment that suppresses nothing fails lint, so stale suppressions cannot pile up.
  options: { reportUnusedDisableDirectives: "error" },
  plugins: ["unicorn", "typescript", "oxc"],
  jsPlugins: [{ name: "effect", specifier: "@mpsuesser/oxlint-plugin-effect" }],
  ignorePatterns: [...agentToolIgnorePatterns, "**/dist/**", "**/*.gen.ts"],
  overrides: [
    {
      files: ["src/**/*.ts", "example/**/*.ts"],
      rules: {
        ...effectRules("error"),
        ...Object.fromEntries(effectPluginRules.map((rule) => [`effect/${rule}`, "error"])),
      },
    },
    {
      files: ["**/*.config.ts", "**/scripts/**", "**/test/**", "example/src/env.ts"],
      rules: { "effect/avoid-process-env": "off" },
    },
  ],
})
