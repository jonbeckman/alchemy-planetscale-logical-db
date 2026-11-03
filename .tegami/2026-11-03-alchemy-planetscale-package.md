---
packages:
  alchemy-planetscale-logical-db:
    type: minor
---

## Import PlanetScale types from `@alchemy.run/planetscale`

Alchemy 2.0.0-beta.84 moved the PlanetScale provider out of `alchemy/Planetscale` and into the `@alchemy.run/planetscale` package. This package now imports `PostgresOrigin` from `@alchemy.run/planetscale` and peers it at `>=2.0.0-beta.84`. Version 2.1.0 still imports `alchemy/Planetscale` and does not typecheck against Alchemy beta.84.

**Required action:** install `@alchemy.run/planetscale` at the same version as `alchemy`, 2.0.0-beta.84 or later.
