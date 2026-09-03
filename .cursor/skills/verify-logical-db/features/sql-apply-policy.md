# SQL apply policy

SQL apply policy lets a user apply forward-only migration files once and reapply changed import files, while the resource rejects a changed migration and a removed tracked record.

## Sub-features

- `apply-new` writes a new file for both `reject` and `reapply`.
- `apply-unchanged` skips an existing file whose hash matches.
- `apply-migration-change` marks a changed existing file as `rejectsChangedFile` when the action is `reject`.
- `apply-import-change` writes a changed existing file when the action is `reapply`.

## How to get to it (user POV)

- Set `migrationsDir` on `PostgresLogicalDatabase`. Changed or removed migration records are rejected.
- Set `importFiles` on `PostgresLogicalDatabase`. Changed imports are reapplied. Removed import records are rejected.
- Run `nub run test` and read the `trackedSqlFileApplyDecision` suite.

## Driving it with verify-logical-db

Preconditions:

- `"$VERIFY" launch` reported `surfaces.library.ready`.
- `"$VERIFY" doctor` reported `worth_driving: true`.

- **Run the policy table.** Run `"$VERIFY" drive --feature sql-apply-policy`. Exit code `0`. Stdout JSON has `ok: true`.
- **Check new files.** `cases.newRejectWrites.shouldWrite` and `cases.newReapplyWrites.shouldWrite` are true. `cases.newRejectWrites.rejectsChangedFile` is false.
- **Check unchanged.** `cases.unchangedSkips.shouldWrite` is false.
- **Check migration reject.** `cases.changedRejects.rejectsChangedFile` is true and `shouldWrite` is true.
- **Check import reapply.** `cases.changedReapplies.rejectsChangedFile` is false and `shouldWrite` is true.
- **Proof.** Keep `artifacts/<run-id>/drive-sql-apply-policy/stdout.json`. Do not apply SQL to PlanetScale for this feature.

## Gotchas

- `shouldWrite` can be true at the same time as `rejectsChangedFile`. The write decision is separate from the reject flag. The resource fails the update when reject is set.
- Migrations use `reject`. Imports use `reapply`. Do not swap them in the proof.
- This feature does not open Postgres. `example-local-migrate` is a different path and does not use this policy table.
