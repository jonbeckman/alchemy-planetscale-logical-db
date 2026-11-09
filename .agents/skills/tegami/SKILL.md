---
name: tegami
description: >-
  Version and publish this repository with Tegami. Use when a change needs a
  .tegami changelog entry, the release:none label, or the Tegami CLI. Do not
  publish from a feature branch.
---

# Tegami

This repository versions and publishes with [Tegami](https://tegami.fuma-nama.dev). The program is `scripts/tegami.mts`. Run it with `nub run tegami`.

Read `docs/releasing.md` before you change the release flow.

No usage skill for Tegami is published on skills.sh. The only listing, `fuma-nama/tegami` `migrate-from-changesets`, migrates a Changesets repository. This repository already uses Tegami.

## Native API

Call the installed package. Keep a single program in `scripts/tegami.mts`.

```ts
import { tegami } from "tegami"
import { runCli } from "tegami/cli"
import { github } from "tegami/plugins/github"
```

`tegami()` returns the handle. Use `generateChangelog()`, `draft()`, `publish()`, and `cleanup()`. `runCli()` starts the CLI. `github()` opens the version pull request and creates the GitHub Release after a successful publish.

The npm client is `nub`. The published package id is `npm:alchemy-planetscale-logical-db`. The example workspace stays ignored.

## Changelog entry

A pull request that changes the published package adds one Markdown file under `.tegami/`.

```md
---
packages:
  alchemy-planetscale-logical-db: patch
---

## Short title

What changed for package consumers.
```

Use `patch`, `minor`, or `major`. A pull request with no effect on the published package uses the `release:none` label and adds no `.tegami/` file.

## Commands

- `nub run tegami` creates a changelog entry.
- `nub run tegami version` applies pending entries and writes the publish lock. Tegami runs this on `tegami/version-packages`.
- `nub run tegami pr preview` builds the release preview.
- `nub run tegami publish --dry-run` validates the publish lock and does not publish.
- `nub run tegami ci` versions or publishes. The Release workflow is the only caller.

Do not run `publish` without `--dry-run`. Do not run `ci` on a feature branch. Do not edit `VERSION`, the `version` field in `package.json`, `CHANGELOG.md`, or `.tegami/publish-lock.yaml` in a feature pull request.

Do not run `init-agent`. It appends a second release section to `AGENTS.md`.
