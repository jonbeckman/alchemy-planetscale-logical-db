# Role name from username

Role name from username lets a user take a PlanetScale connection username that contains a suffix and pass the Postgres-visible role prefix into `appRoleName`.

## Sub-features

- `role-suffix` maps `app.branch.id` to `app`.
- `role-plain` maps `app` to `app`.
- `role-empty` maps `""` to `""`.

## How to get to it (user POV)

- Call `postgresRoleNameFromUsername` on `applicationRole.username` as shown in the `PostgresLogicalDatabase` doc example.
- Import `postgresRoleNameFromUsername` from `alchemy-planetscale-logical-db` (`src/index.ts` in this checkout).

## Driving it with verify-logical-db

Preconditions:

- `"$VERIFY" launch` reported `surfaces.library.ready`.
- `"$VERIFY" doctor` reported `worth_driving: true`.

- **Run the helper.** Run `"$VERIFY" drive --feature role-name-from-username`. Exit code `0`. Stdout JSON has `ok: true` and `module: "src/index.ts"`.
- **Check the suffix split.** `cases.suffixed` is `app`. `cases.plain` is `app`. `cases.empty` is `""`.
- **Proof.** Keep `artifacts/<run-id>/drive-role-name-from-username/stdout.json`. Do not call PlanetScale for a username.

## Gotchas

- The helper splits on the first `.` only by taking `[0]`. It does not validate the prefix as a Postgres identifier.
- PlanetScale usernames can contain more than one `.`. The visible role is the first segment.
- An empty username becomes an empty role name. The resource treats a missing `appRoleName` as no grant, not as this helper output.
