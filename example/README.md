# PlanetScale + PGLite Example

This example uses `alchemy-planetscale-logical-db` to provision multiple
logical PostgreSQL databases inside one PlanetScale Postgres cluster. Each
project gets:

- one app role
- one logical PostgreSQL database inside the shared cluster

The local path applies the same SQL files to PGLite. That is the walkthrough
agents and local development use. Remote `plan:db` / `deploy:db` stay for
humans who already have PlanetScale credentials.

## Project Shape

```text
alchemy.db.run.ts         # shared PlanetScale cluster and logical DBs
scripts/migrate-local.ts  # apply one project's migrations to local PGLite
migrations/project_a      # migrations for logical DB project_a
migrations/project_b      # migrations for logical DB project_b
```

## Install

From the repository root:

```sh
nub install
cd example
cp .env.example .env
```

Fill in `example/.env` with PlanetScale credentials before a remote plan or
deploy:

```sh
PLANETSCALE_ORGANIZATION=...
PLANETSCALE_API_TOKEN_ID=...
PLANETSCALE_API_TOKEN=...
```

Local PGLite migrate does not need those values.

## Deploy the Shared Database Stack

Edit `example/src/config.ts` first if you want a different cluster name,
region, size, or logical database names.

```sh
nub run plan:db
nub run deploy:db
```

`alchemy.db.run.ts` creates:

- `side-projects-postgres`, a single PlanetScale Postgres `PS_20` cluster
- `project_a`, a logical database
- `project_b`, a logical database
- separate app roles for both logical databases

The app roles are intentionally separate. Each logical database has its own
application role.

## Local Dev With PGLite

Terminal 1:

```sh
nub run dev:db
```

Terminal 2:

```sh
nub run migrate:local
```

`migrate:local` sets:

```sh
APP_SLUG=project_a
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15432/postgres?sslmode=disable
```

That applies `migrations/project_a` to the local PGLite instance. It does not
talk to PlanetScale. To migrate the second project, run the same script with
`APP_SLUG=project_b`.
