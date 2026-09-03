# Example local migrate

Example local migrate lets a user start PGLite and apply `example/migrations/project_a` through `example/scripts/migrate-local.ts` so the `notes` table exists without PlanetScale or Cloudflare.

## Sub-features

- `pglite-listen` opens `127.0.0.1` on the verify-owned port.
- `migrate-project-a` prints `applied project_a/0001_init.sql`.
- `notes-present` reports `to_regclass('public.notes')` as `notes`.
- `project-b-absent` leaves `public.bookmarks` missing when only `project_a` ran.

## How to get to it (user POV)

- From `example/`, run `nub run dev:db` then `nub run migrate:local` as documented in `example/README.md`.
- From the repo root, run `verify-logical-db launch --surface example` then `verify-logical-db drive --feature example-local-migrate`.

## Driving it with verify-logical-db

Preconditions:

- `"$VERIFY" launch --surface example` reported `surfaces.example.ready`.
- `"$VERIFY" doctor` reported `worth_driving: true`.
- The PGLite port is the verify-owned port from state, not `15432`, unless this run started `15432`.

- **Show the surface.** Run `"$VERIFY" doctor` and confirm `example.pidAlive` and `example.cmdlineHasPglite`.
- **Run migrate.** Run `"$VERIFY" drive --feature example-local-migrate`. Exit code `0`. Stdout JSON has `ok: true` and `notesRegclass: "notes"`.
- **Check the skip.** `skipped.libraryClient` is true. This drive did not call `PostgresLogicalDatabaseClient`.
- **Check project isolation.** `bookmarksAbsent` is true after a `project_a` migrate.
- **Proof.** Keep `artifacts/<run-id>/drive-example-local-migrate/stdout.json` and `migrate.log`. The log contains `applied project_a/0001_init.sql`.

## Gotchas

- `nub run --cwd example migrate:local` hardcodes port `15432`. The CLI overrides `DATABASE_URL` for the verify port.
- Doctor `cmdlineHasPglite` is true when the recorded PID cmdline contains `pglite-server` or `pglite-socket`. Nub shims replace the binary name with `node` plus the `pglite-socket` server script.
- The library client cannot target PGLite. It sets `ssl.rejectUnauthorized` to true.
- `0001_init.sql` uses `create table if not exists`. A second drive on the same data dir still exits 0.
- Do not treat this path as proof that `PostgresLogicalDatabase` reconciled ownership, migrations tables, or app-role grants.
