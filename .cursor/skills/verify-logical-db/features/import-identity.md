# Import identity

Import identity lets a user keep an existing `__alchemy_imports` row stored as `./seed/users.sql` when the stack now lists `seed/users.sql`, without the resource treating that row as removed. The same matching keeps a Drizzle folder tracking row `NAME` when `listSqlFiles` now ids the file as `NAME/migration.sql`.

## Sub-features

- `identity-canonical-dot` treats `seed/users.sql` and `./seed/users.sql` as the same identity.
- `identity-inner-dot` treats `seed/users.sql` and `seed/./users.sql` as the same identity.
- `identity-not-parent` does not collapse `../seed/users.sql` onto `seed/users.sql`.
- `identity-legacy-row` leaves `removedRecordNames` empty when the desired id is canonical and the stored name is dotted.
- `identity-lookup` finds the legacy dotted row for a canonical file id.
- `identity-drizzle-folder` treats `NAME` and `NAME/migration.sql` as the same identity.
- `identity-drizzle-row` leaves `removedRecordNames` empty when the desired id is `NAME/migration.sql` and the stored name is the folder.
- `identity-drizzle-lookup` finds the folder-name row for `NAME/migration.sql`.

## How to get to it (user POV)

- Deploy a stack whose `importFiles` used a dotted form, then change those values to canonical paths as the README describes.
- Run `nub run test` and read the `importFilePath identity` and `removedRecordNames import identity` suites.

## Driving it with verify-logical-db

Preconditions:

- `"$VERIFY" launch` reported `surfaces.library.ready`.
- `"$VERIFY" doctor` reported `worth_driving: true`.

- **Run identity checks.** Run `"$VERIFY" drive --feature import-identity`. Exit code `0`. CLI stdout has `ok: true`.
- **Check same identity.** `result.checks.same` and `result.checks.sameInner` are true. Those fields are top-level under `checks` in `stdout.json`.
- **Check unstable paths.** `result.checks.notParent` and `result.checks.notAbs` are true.
- **Check legacy rows.** `result.checks.removed` is `[]`. `result.checks.stored.storedName` is `./seed/users.sql` and `result.checks.stored.hash` is `abc`.
- **Check Drizzle folders.** `result.checks.sameDrizzleGtt` and `result.checks.sameDrizzleSolzero` are true. `result.checks.removedDrizzle` is `[]`. `result.checks.storedDrizzleGtt.storedName` is `20260526000000_gtt_postgres_baseline` and `result.checks.storedDrizzleSolzero.storedName` is `20260526000000_solzero_postgres_baseline`.
- **Proof.** Keep `artifacts/<run-id>/drive-import-identity/stdout.json`. A passing `validateImportFilePath` run is not this feature.

## Gotchas

- New `importFiles` values still must pass `validateImportFilePath`. Identity collapse is for stored rows, not for new props.
- Parent and absolute paths keep their original string and do not become a safe path.
- Do not invent a PlanetScale deploy to prove identity. The tracking helpers are the user-visible contract.
