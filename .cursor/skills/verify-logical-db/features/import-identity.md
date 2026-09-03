# Import identity

Import identity lets a user keep an existing `__alchemy_imports` row stored as `./seed/users.sql` when the stack now lists `seed/users.sql`, without the resource treating that row as removed.

## Sub-features

- `identity-canonical-dot` treats `seed/users.sql` and `./seed/users.sql` as the same identity.
- `identity-inner-dot` treats `seed/users.sql` and `seed/./users.sql` as the same identity.
- `identity-not-parent` does not collapse `../seed/users.sql` onto `seed/users.sql`.
- `identity-legacy-row` leaves `removedRecordNames` empty when the desired id is canonical and the stored name is dotted.
- `identity-lookup` finds the legacy dotted row for a canonical file id.

## How to get to it (user POV)

- Deploy a stack whose `importFiles` used a dotted form, then change those values to canonical paths as the README describes.
- Run `nub run test` and read the `importFilePath identity` and `removedRecordNames import identity` suites.

## Driving it with verify-logical-db

Preconditions:

- `"$VERIFY" launch` reported `surfaces.library.ready`.
- `"$VERIFY" doctor` reported `worth_driving: true`.

- **Run identity checks.** Run `"$VERIFY" drive --feature import-identity`. Exit code `0`. Stdout JSON has `ok: true`.
- **Check same identity.** `checks.same` and `checks.sameInner` are true.
- **Check unstable paths.** `checks.notParent` and `checks.notAbs` are true.
- **Check legacy rows.** `checks.removed` is `[]`. `checks.stored.storedName` is `./seed/users.sql` and `checks.stored.hash` is `abc`.
- **Proof.** Keep `artifacts/<run-id>/drive-import-identity/stdout.json`. A passing `validateImportFilePath` run is not this feature.

## Gotchas

- New `importFiles` values still must pass `validateImportFilePath`. Identity collapse is for stored rows, not for new props.
- Parent and absolute paths keep their original string and do not become a safe path.
- Do not invent a PlanetScale deploy to prove identity. The tracking helpers are the user-visible contract.
