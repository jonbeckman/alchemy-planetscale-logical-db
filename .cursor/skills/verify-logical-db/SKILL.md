---
name: verify-logical-db
description: Verify alchemy-planetscale-logical-db (Alchemy v2 logical Postgres resource) through its public API, Node tests, and the example local PGLite migrate path. Use when proving library behavior after a change.
---

# Verify alchemy-planetscale-logical-db

Read this cold. Drive the published library surface. Do not npm publish. Do not deploy `example/` to Alchemy, Cloudflare, or PlanetScale. Do not bump product dependencies.

This repo is an npm library, not a live app. The user path is TypeScript import plus `nub run test`. `example/` is a secondary local PGLite walkthrough. Remote `nub run deploy:db` and `nub run deploy:app:remote` are out of scope.

## Helpers

The CLI lives at `.cursor/skills/verify-logical-db/bin/verify-logical-db`. Make it executable once per checkout if needed, then prefer the repo-relative path.

```bash
VERIFY=./.cursor/skills/verify-logical-db/bin/verify-logical-db
chmod +x "$VERIFY"
```

JSON is always written to stdout. Human noise stays on stderr. Commands:

```bash
"$VERIFY" launch
"$VERIFY" launch --surface example
"$VERIFY" doctor
"$VERIFY" drive --feature import-path-validation
"$VERIFY" snapshot --export /opt/cursor/artifacts/verify-logical-db
"$VERIFY" cleanup
"$VERIFY" features
```

State: `.cursor/skills/verify-logical-db/.run/state.json` (or `$VERIFY_STATE`).
Evidence: `.cursor/skills/verify-logical-db/artifacts/<run-id>/` (or `$VERIFY_EVIDENCE_DIR/<run-id>`). Gitignored. Cleanup must not delete it.

`nub` resolves Node 24.15.0 from `package.json` `devEngines`. Put `nub` on `PATH` before you launch. Do not call `/exec-daemon/node` (Node 22) for this skill.

## Launch

The library is short-lived. Launch means install once, run the Node tests, and build `dist/`. Each drive is its own process.

1. From the repo root, run `"$VERIFY" launch`.
2. Launch runs `nub install --frozen-lockfile` when `node_modules` is missing, then `nub run test` and `nub run build`.
3. Ready when stdout `ok` is true, `surfaces.library.ready` is true, `surfaces.library.testOk` is true, and `dist/index.js` exists.
4. Optional example surface: `"$VERIFY" launch --surface example` (or `--surface all`). This starts `pglite-server` on `127.0.0.1:$VERIFY_PGLITE_PORT` (default `25432`) with a disposable data dir under `.run/`. Ready when that port answers.
5. Teardown is `cleanup`. Kill only PIDs recorded in state. Never `pkill pglite-server`.

Isolation: refuse to bind the PGLite port if something else already owns it. Two verify runs must use different `VERIFY_RUN_ID`, `VERIFY_STATE`, and `VERIFY_PGLITE_PORT` values. Do not drive `example/.pglite` or port `15432` unless this run started that process.

## Doctor

Read-only. Run before the first drive, and again whenever anything looks off.

```bash
"$VERIFY" doctor
```

Worth driving only when `worth_driving` is true:

- `packageName` is `alchemy-planetscale-logical-db`
- `library.distExists` is true
- `library.testExists` is true (`test/postgres-logical-database.test.ts`)
- `library.ready` is true from this run's launch
- `nubOk` is true
- Example is optional. If state has a PGLite PID, doctor checks that PID is alive and the cmdline still contains `pglite-server` or `pglite-socket`. Nub shims exec `node` against the `pglite-socket` server script, so argv is not `pglite-server`.

If doctor fails, stop driving. Cleanup residue, then relaunch.

## Drive

Read `features/README.md`, then the feature file. Use the exact `verify-logical-db` commands in that file. Stable handles:

- Public API from `src/index.ts`: `validateImportFilePath`, `postgresRoleNameFromUsername`, `PostgresLogicalDatabase`, `providers`
- Identity helpers the tests import: `importFilePathsEqual` from `src/PostgresLogicalDatabase.ts`; `removedRecordNames` and `existingTrackedSqlFileRecord` from `src/PostgresLogicalDatabaseClient.ts`
- Apply policy: `trackedSqlFileApplyDecision` (migrations `reject`, imports `reapply`)
- Example local: `example/scripts/migrate-local.ts` with `APP_SLUG=project_a`

Forbidden feature IDs: `deploy-db`, `deploy-app`, `npm-publish`, `alchemy-remote`.

Prefer the default proof `import-path-validation`. That path imports the public barrel. It does not open a database.

Do not drive `PostgresLogicalDatabaseClient` against local PGLite. The client sets `ssl: { rejectUnauthorized: true }` and talks to PlanetScale. The example migrate script is a different helper.

## Evidence

Proof lives in `.cursor/skills/verify-logical-db/artifacts/<run-id>/` and, when requested, a text export under `/opt/cursor/artifacts/verify-logical-db`.

Standards:

- Drive the public API or the documented example script. Do not treat `nub run lint` as a substitute for a mapped feature.
- Capture the command, stdout JSON, and exit code.
- Launch already ran `nub run test`. Keep `artifacts/<run-id>/launch/test.log` as the library run log.
- Mutation proof (`example-local-migrate`) must re-read `to_regclass('public.notes')` after migrate.
- Observe the PlanetScale skip: `example-local-migrate` must report `skipped.libraryClient: true`.
- Do not commit screenshot binaries. This library has no UI.

`"$VERIFY" snapshot` writes `snapshot/snapshot.json`. `"$VERIFY" snapshot --export DIR` copies the run evidence to `DIR/<run-id>`.

## Cleanup

```bash
"$VERIFY" cleanup
```

Kills only recorded PGLite PIDs whose `/proc/<pid>/cmdline` still contains `pglite-server` or `pglite-socket`. Removes `.run/` scratch (state, disposable PGLite data). Does not delete `artifacts/<run-id>/`. After cleanup, confirm `evidence_survived` is non-empty. A cleanup that eats the proof has failed.

## Feature map

`features/` is the maintained source. Drive the feature named by the task. If the task is to prove the skill, drive `import-path-validation` once end to end.

Keep the map honest with `/maintain-verification-skill` when public exports, import path rules, or the example local migrate command change.
