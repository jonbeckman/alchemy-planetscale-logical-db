# Contributing to alchemy-planetscale-logical-db

This repository is the Apache-2.0 Alchemy v2 resource
[`alchemy-planetscale-logical-db`](https://github.com/jonbeckman/alchemy-planetscale-logical-db).
Read the [README](README.md) for the product picture and the
[example](example/README.md) for the PlanetScale + PGLite + Hyperdrive walkthrough.

## Before you start

- Search existing issues and pull requests before opening a new one.
- For substantial changes, open an issue first so maintainers can align on the problem and approach.
- Report suspected vulnerabilities privately to the maintainers. Do not include credentials or exploit details in a public issue.

## Development setup

This repository requires Node.js 24.15.0 and Nub 0.4.11. `.node-version`, `.nvmrc`, and
`packageManager` are the source of truth. Install Nub, then install dependencies from the
repository root:

```sh
nub install --frozen-lockfile
```

Keep the root + `example` + `packages/*` workspace layout. Do not introduce a second package
manager. Keep oxlint and oxfmt; do not add eslint, prettier, biome, or dprint.

`nub run lint` runs Oxlint with the workspace `lint` plugin, `@mpsuesser/oxlint-plugin-effect`,
and `anti-slop` from `github:dmmulroy/anti-slop`. This repository also enables the opt-in
`anti-slop-effect` plugin because the package depends on Effect. Those anti-slop rules run
at `error`. Lint loads the GitHub package through `tsx` because that package ships TypeScript
source.

For the example, copy `example/.env.example` to `example/.env` and fill in credentials locally.
Do not commit `.env` files.

Create a focused branch, keep changes scoped, and add or update tests for behavior changes.

## Releases

This repository uses Tegami to version and publish the one npm package. Read
[docs/releasing.md](docs/releasing.md) for changelog format, the version pull
request, and npm publish. Do not bump `package.json` or `VERSION`, or rewrite
`CHANGELOG.md`, in a feature pull request. Add a `.tegami/` entry when the
published package has an observable change. Use the `release:none` label when
it does not.

## Validation

Run the repository checks before opening a pull request:

```sh
nub run check
```

That script typechecks the package, lints, checks formatting, runs unit tests, builds, and
typechecks `example`. Unit tests live in `test/` and run through Node's test runner. If a
check cannot run in your environment, explain why in the pull request.

## Pull requests

A strong pull request includes:

- A concise explanation of the problem and solution
- Tests or a clear explanation of why tests are not needed
- Documentation and config example updates when behavior or configuration changes
- No credentials, private data, internal URLs, or organization-specific defaults
- No production deploy, npm publish, or paid spend

By submitting a contribution, you agree that it may be distributed under the repository's
Apache-2.0 license and that you have the right to contribute it.
