# alchemy-planetscale-logical-db

Alchemy v2 resource for managing logical PostgreSQL databases inside a
PlanetScale Postgres cluster.

This package exists because a logical PostgreSQL database is not a first-class
PlanetScale cloud resource. The resource connects through a PlanetScale
Postgres admin role and reconciles database-local state:

- creates or drops one PostgreSQL database inside the cluster
- writes an ownership marker inside the logical database
- applies forward-only migration files once
- reapplies changed import/seed files
- grants an application role access to user tables and sequences

## Install

```sh
pnpm add alchemy-planetscale-logical-db
```

The package expects Alchemy v2 and Effect from the consuming project:

```sh
pnpm add alchemy@2.0.0-beta.58 effect@4.0.0-beta.88
```

## Usage

```ts
import * as Alchemy from "alchemy"
import * as Output from "alchemy/Output"
import * as Planetscale from "alchemy/Planetscale"
import * as PlanetscaleLogicalDb from "alchemy-planetscale-logical-db"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const program = Effect.gen(function* () {
  const database = yield* Planetscale.PostgresDatabase("SharedPostgres", {
    clusterSize: "PS_20",
    defaultBranch: "main",
    name: "shared-postgres",
    region: { slug: "us-east" },
  })

  const adminRole = yield* Planetscale.PostgresRole("AdminRole", {
    branch: "main",
    database,
    inheritedRoles: ["postgres"],
    successor: "postgres",
  })

  const appRole = yield* Planetscale.PostgresRole("AppRole", {
    branch: "main",
    database,
    inheritedRoles: [],
    successor: "postgres",
  })

  return yield* PlanetscaleLogicalDb.PostgresLogicalDatabase("AppDatabase", {
    adminOrigin: adminRole.origin,
    appRoleName: Output.map(appRole.username, PlanetscaleLogicalDb.postgresRoleNameFromUsername),
    appRolePrivilegesVersion: 1,
    migrationsDir: "./migrations/app",
    name: "app",
  })
})

export class DatabaseStack extends Alchemy.Stack<DatabaseStack, unknown>()("Database") {}

export default DatabaseStack.make(
  {
    providers: Layer.mergeAll(Planetscale.providers(), PlanetscaleLogicalDb.providers()),
    state: Alchemy.localState(),
  },
  program,
)
```

## API

`PostgresLogicalDatabase(id, props)` accepts:

- `adminOrigin`: admin Postgres origin from a role that can create databases.
- `name`: logical database name. If omitted, Alchemy generates one.
- `appRoleName`: Postgres-visible app role name to grant.
- `appRolePrivilegesVersion`: bump to force privilege reconciliation.
- `migrationsDir`: directory of forward-only `.sql` migration files.
- `migrationsTable`: migration tracking table, defaulting to
  `__alchemy_migrations`.
- `importFiles`: SQL files to apply as mutable imports/seed data.
- `importsTable`: import tracking table, defaulting to `__alchemy_imports`.

The resource type remains `Planetscale.PostgresLogicalDatabase` for state
compatibility with the original upstream branch.

## Example

The original PlanetScale + PGLite + Hyperdrive example lives in
[`example/`](./example). It shows one shared PlanetScale Postgres cluster with
two logical databases and one Cloudflare Hyperdrive-backed Vite Worker.
