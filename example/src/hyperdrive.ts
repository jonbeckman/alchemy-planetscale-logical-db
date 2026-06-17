import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Output from "alchemy/Output"
import * as Planetscale from "alchemy/Planetscale"
import * as PlanetscaleLogicalDb from "alchemy-planetscale-logical-db"
import * as Effect from "effect/Effect"
import * as Redacted from "effect/Redacted"
import { DB_STACK_NAME, type ProjectConfig } from "./config.ts"
import { AppDbMode, requiredEnv, type AppDbMode as AppDbModeValue } from "./env.ts"

type LocalPostgresOrigin = Required<Cloudflare.HyperdriveDevOrigin>
type PostgresScheme = LocalPostgresOrigin["scheme"]
type PostgresSslMode = NonNullable<Cloudflare.HyperdriveDevOrigin["sslmode"]>

const postgresSslModes = new Set<PostgresSslMode>([
  "disable",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
])

function parsePostgresSslMode(value: string | null): PostgresSslMode {
  if (value === null) {
    return "prefer"
  }

  if (postgresSslModes.has(value as PostgresSslMode)) {
    return value as PostgresSslMode
  }

  throw new Error(`Invalid Postgres sslmode "${value}".`)
}

function assertPostgresScheme(value: string): asserts value is PostgresScheme {
  if (value !== "postgres" && value !== "postgresql") {
    throw new Error(`DATABASE_URL must use postgres/postgresql, got "${value}".`)
  }
}

export function parseLocalPostgresOrigin(databaseUrl: string): LocalPostgresOrigin {
  const url = new URL(databaseUrl)
  const scheme = url.protocol.slice(0, -1)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))

  assertPostgresScheme(scheme)

  if (!url.hostname || !url.port || !url.username || !database) {
    throw new Error("DATABASE_URL must include host, port, user, and database.")
  }

  return {
    database,
    host: url.hostname,
    password: Redacted.make(decodeURIComponent(url.password)),
    port: Number(url.port),
    scheme,
    sslmode: parsePostgresSslMode(url.searchParams.get("sslmode")),
    user: decodeURIComponent(url.username),
  }
}

export function createProjectHyperdrive(project: ProjectConfig, appDbMode: AppDbModeValue) {
  switch (appDbMode) {
    case AppDbMode.local:
      return createLocalHyperdrive(project)
    case AppDbMode.remote:
      return createRemoteHyperdrive(project)
  }
}

function createLocalHyperdrive(project: ProjectConfig) {
  return Effect.gen(function* () {
    const context = yield* Alchemy.AlchemyContext

    if (!context.dev) {
      return yield* Effect.die(new Error("APP_DB_MODE=local is only supported with `alchemy dev`."))
    }

    const origin = parseLocalPostgresOrigin(requiredEnv("DATABASE_URL"))

    return yield* Cloudflare.Hyperdrive(`${project.resourcePrefix}PostgresHyperdrive`, {
      caching: { disabled: true },
      dev: origin,
      name: `${project.workerName}-local-db`,
      origin,
      originConnectionLimit: 1,
    })
  })
}

function createRemoteHyperdrive(project: ProjectConfig) {
  return Effect.gen(function* () {
    const appRole = yield* Planetscale.PostgresRole.ref(
      `${project.resourcePrefix}PostgresAppRole`,
      {
        stack: DB_STACK_NAME,
      },
    )
    const logicalDatabase = yield* PlanetscaleLogicalDb.PostgresLogicalDatabase.ref(
      `${project.resourcePrefix}PostgresDatabase`,
      { stack: DB_STACK_NAME },
    )
    const origin = Output.map(
      Output.all(appRole.origin, logicalDatabase.name),
      ([roleOrigin, database]) => ({
        ...roleOrigin,
        database,
        port: 6432,
      }),
    )

    return yield* Cloudflare.Hyperdrive(`${project.resourcePrefix}PostgresHyperdrive`, {
      caching: { disabled: true },
      name: `${project.workerName}-db`,
      origin,
      originConnectionLimit: 5,
    })
  })
}
