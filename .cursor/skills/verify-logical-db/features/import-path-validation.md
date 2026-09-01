# Import path validation

Import path validation lets a user pass `importFiles` on `PostgresLogicalDatabase` and get a throw before any database work when a path is not a normalized repository-relative identifier.

## Sub-features

- `import-accept` accepts `seeds/users.sql`, `a.sql`, `_private/seed.sql`, and `nested/deep/file.sql`.
- `import-reject-dot` rejects `./seed/users.sql` and `seeds/./users.sql`.
- `import-reject-parent` rejects `../secrets.sql` and `seeds/../users.sql`.
- `import-reject-absolute` rejects `/abs/path.sql` and `C:/seeds/users.sql`.
- `import-reject-empty` rejects `""` and `seeds//users.sql`.

## How to get to it (user POV)

- Pass `importFiles` to `PostgresLogicalDatabase` in an Alchemy stack as documented in the root README API section.
- Import `validateImportFilePath` from `alchemy-planetscale-logical-db` (`src/index.ts` in this checkout).
- Run `nub run test` and read the `validateImportFilePath` suite.

## Driving it with verify-logical-db

Preconditions:

- `"$VERIFY" launch` reported `surfaces.library.ready`.
- `"$VERIFY" doctor` reported `worth_driving: true`.

- **Show the command.** Run `"$VERIFY" features` and confirm `import-path-validation` is listed.
- **Run the public helper.** Run `"$VERIFY" drive --feature import-path-validation`. Exit code `0`. Stdout JSON has `ok: true`, `module: "src/index.ts"`, four accepted paths, and the rejected paths from the test file.
- **Check the reject text.** Each reject throws a message that contains `normalized, repository-relative path`.
- **Proof.** Keep `artifacts/<run-id>/drive-import-path-validation/stdout.json` and `assertions.json`. Both identify `src/index.ts`. Do not treat `nub run lint` as a substitute for this public helper.

## Gotchas

- Desired `importFiles` must be canonical. `./seed/users.sql` is valid identity for an existing tracking row and invalid as a new `importFiles` value.
- The helper throws. It does not return a Result.
- Windows backslashes and drive prefixes are rejects even on Linux.
- This feature does not open Postgres.
