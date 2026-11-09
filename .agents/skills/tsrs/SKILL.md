---
name: tsrs
description: >-
  Typecheck this repository with tsrs, the Rust port of the TypeScript 7
  compiler, and emit the build with tsc. Use when you change TypeScript
  config, typecheck, or the package build.
---

# TypeScript and tsrs

`tsrs` typechecks this repository. The `typescript` package emits the build. Use the scripts in `package.json`. Do not replace either command with another compiler.

No consumer skill for `tsrs` is published on skills.sh. `oxc-project/tsrs` ships `triage` and `pr-writer` for the compiler repository. Those skills do not typecheck an application.

## Commands

```sh
nub run typecheck
nub run build
```

`typecheck` runs `tsrs --noEmit` with `tsconfig.json`, then `tsrs -p tsconfig.test.json --noEmit`. `build` runs `tsc -p tsconfig.build.json`.

The installed `tsrs` package records the TypeScript commit it ports. Read `tsrs.typescriptVersion` and `tsrs.typescriptCommit` in `node_modules/tsrs/package.json`.

## Native API

The `tsrs` CLI accepts the same flags as `tsc`. Pass the flags the project scripts already pass. Do not add `--fast` unless a script already sets it.

For a programmatic compiler, import the installed package. Entry points are the `exports` field in `node_modules/tsrs/package.json` (`tsrs`, `tsrs/sync`, `tsrs/async`, and the `tsrs/ast` paths). Read `node_modules/tsrs/README.md` and the types beside the entry point before you call them.

Effect diagnostics already have a script:

```sh
nub run effect:diagnostics
```

That runs `effect-tsrs diagnostics`. Do not add a second diagnostics runner.
