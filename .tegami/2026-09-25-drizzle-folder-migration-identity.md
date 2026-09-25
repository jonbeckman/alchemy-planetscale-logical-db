---
packages:
  alchemy-planetscale-logical-db: patch
---

## Match Drizzle folder migration identities

Tracking rows stored as a Drizzle folder name such as
`20260526000000_gtt_postgres_baseline` now match the listed file
`NAME/migration.sql`. The resource does not treat that row as removed and
does not delete it. A later rewrite stores the canonical
`NAME/migration.sql` identity after the hash check. Dotted forms such as
`./seed/users.sql` still match `seed/users.sql`.
