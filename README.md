# Alchemy + PlanetScale + PGLite + Hyperdrive

This is a small copyable Alchemy v2 example for one PlanetScale Postgres cluster
that hosts multiple logical databases for small projects. Each project gets:

- one app role
- one logical Postgres database inside the shared cluster
- one Hyperdrive config bound to a Vite Worker

The Vite app here is only a placeholder. The important part is the Alchemy
wiring.

## Project Shape

```text
alchemy.db.run.ts      # shared PlanetScale cluster and logical DBs
alchemy.app.run.ts     # Vite Worker + Hyperdrive binding for one project
src/hyperdrive.ts      # APP_DB_MODE local/remote switch
migrations/project_a   # migrations for logical DB project_a
migrations/project_b   # migrations for logical DB project_b
```

## Install

This example tracks Alchemy from `https://pkg.ing/alchemy/main` so it can use
the latest Alchemy v2 PlanetScale resources without waiting on a published npm
release.

```sh
pnpm install
cp .env.example .env
```

Fill in `.env` with Cloudflare and PlanetScale credentials:

```sh
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
PLANETSCALE_ORGANIZATION=...
PLANETSCALE_API_TOKEN_ID=...
PLANETSCALE_API_TOKEN=...
```

## Deploy the Shared Database Stack

Edit `src/config.ts` first if you want a different cluster name, region, size,
or logical database names.

```sh
pnpm plan:db
pnpm deploy:db
```

`alchemy.db.run.ts` creates:

- `side-projects-postgres`, a single PlanetScale Postgres `PS_20` cluster
- `project_a`, a logical database
- `project_b`, a logical database
- separate app roles for both logical databases

The app roles are intentionally separate. Hyperdrive for `project_a` receives
credentials for the `ProjectAPostgresAppRole` role and the `project_a` logical
database name.

`Planetscale.PostgresLogicalDatabase` creates each logical database, applies the
project's SQL files, and grants the app role.

## Local Dev With PGLite

Terminal 1:

```sh
pnpm dev:db
```

Terminal 2:

```sh
pnpm migrate:local
pnpm dev:app
```

In local mode, the app script sets:

```sh
APP_DB_MODE=local
APP_SLUG=project_a
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:15432/postgres?sslmode=disable
```

`src/hyperdrive.ts` parses `DATABASE_URL` and creates a Hyperdrive config whose
`origin` and `dev` origin both point at the local PGLite socket server. The
Worker still receives a normal `DB` Hyperdrive binding, so app-side database
code does not need to know whether it is talking to local PGLite or remote
PlanetScale.

## Remote App Deploy

Deploy the DB stack first, then deploy the app stack:

```sh
pnpm plan:app:remote
pnpm deploy:app:remote
```

In remote mode, the app script sets:

```sh
APP_DB_MODE=remote
APP_SLUG=project_a
```

`src/hyperdrive.ts` resolves `ProjectAPostgresAppRole` and the
`ProjectAPostgresDatabase` logical database resource from the `SharedPostgres`
stack, builds the Hyperdrive origin from the PlanetScale role credentials plus
the logical database name, and uses PlanetScale's pooled Postgres port `6432`.

To deploy the second project, switch `APP_SLUG=project_b` in the app scripts or
run the commands with an environment override.
