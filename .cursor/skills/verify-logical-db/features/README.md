# alchemy-planetscale-logical-db verification map

This directory is the maintained source for verifying the user-facing behavior of `alchemy-planetscale-logical-db`. Read the index before driving the library, then use the matching feature file as the recipe.

## Baseline preconditions

- Work from the repository root that contains `package.json` name `alchemy-planetscale-logical-db`.
- Put `VERIFY=./.cursor/skills/verify-logical-db/bin/verify-logical-db` on your command line.
- Run `"$VERIFY" launch` then `"$VERIFY" doctor`. Require `worth_driving: true`.
- Never npm publish. Never run `example` `deploy:db` or `deploy:app:remote`.
- Never drive a PGLite instance this run did not start.

## Driving conventions

- Start every recipe from the baseline unless its preconditions say otherwise.
- Prefer the `verify-logical-db` CLI so evidence lands in `artifacts/<run-id>/`.
- Treat every command as literal. Keep feature IDs and flags unchanged.
- Library API commands go through `verify-logical-db drive --feature …`.
- Example migrate goes through the same CLI after `launch --surface example`.
- Cleanup removes verify scratch and verify-started PIDs only. Proof artifacts stay.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final value.
- CLI proof includes the command, stdout JSON, and exit code.
- Launch proof includes `launch/test.log` and `launch/build.log`.
- Mutation proof includes a second read of the stored value (`to_regclass`).
- Record the feature ID with every artifact.
- Report an unreachable path with the attempted command and the unmet prerequisite.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-logical-db` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Import path validation](./import-path-validation.md) covers public `validateImportFilePath` accept and reject cases.
- [Import identity](./import-identity.md) covers canonical and dotted tracking-row identity.
- [SQL apply policy](./sql-apply-policy.md) covers migration reject versus import reapply.
- [Role name from username](./role-name-from-username.md) covers `postgresRoleNameFromUsername`.
- [Example local migrate](./example-local-migrate.md) covers PGLite plus `migrate-local` for `project_a`.
