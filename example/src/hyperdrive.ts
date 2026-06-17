import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Output from "alchemy/Output"
import * as Planetscale from "alchemy/Planetscale"
import * as PlanetscaleLogicalDb from "alchemy-planetscale-logical-db"
import * as Effect from "effect/Effect"
import * as HashSet from "effect/HashSet"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import { DB_STACK_NAME, type ProjectConfig } from "./config.ts"
import { AppDbMode, requiredEnv, type AppDbMode as AppDbModeValue } from "./env.ts"

type LocalPostgresOrigin = Required<Cloudflare.HyperdriveDevOrigin>
type PostgresScheme = LocalPostgresOrigin["scheme"]
type PostgresSslMode = NonNullable<Cloudflare.HyperdriveDevOrigin["sslmode"]>

const postgresSslModes = HashSet.fromIterable<PostgresSslMode>([
  "disable",
  "prefer",
  "require",
  "verify-ca",
  "verify-full",
])

function invalidPostgresSslMode(value: string): never {
  throw new Error(`Invalid Postgres sslmode "${value}".`)
}

const parsePresentPostgresSslMode = (value: string): PostgresSslMode =>
  Match.value(HashSet.has(postgresSslModes, value as PostgresSslMode)).pipe(
    Match.when(true, () => value as PostgresSslMode),
    Match.when(false, () => invalidPostgresSslMode(value)),
    Match.exhaustive,
  )

const parsePostgresSslMode = (value: string | null): PostgresSslMode =>
  Option.fromNullOr(value).pipe(
    Option.match({
      onNone: () => "prefer",
      onSome: parsePresentPostgresSslMode,
    }),
  )

const isPostgresScheme = (value: string): value is PostgresScheme =>
  value === "postgres" || value === "postgresql"

function invalidPostgresScheme(value: string): never {
  throw new Error(`DATABASE_URL must use postgres/postgresql, got "${value}".`)
}

function assertPostgresScheme(value: string): asserts value is PostgresScheme {
  Match.value(isPostgresScheme(value)).pipe(
    Match.when(true, () => undefined),
    Match.when(false, () => invalidPostgresScheme(value)),
    Match.exhaustive,
  )
}

const hasLocalPostgresOriginParts = (url: URL, database: string) =>
  url.hostname !== "" && url.port !== "" && url.username !== "" && database !== ""

function missingLocalPostgresOriginParts(): never {
  throw new Error("DATABASE_URL must include host, port, user, and database.")
}

const validateLocalPostgresOriginParts = (url: URL, database: string) =>
  Match.value(hasLocalPostgresOriginParts(url, database)).pipe(
    Match.when(true, () => undefined),
    Match.when(false, () => missingLocalPostgresOriginParts()),
    Match.exhaustive,
  )

export function parseLocalPostgresOrigin(databaseUrl: string): LocalPostgresOrigin {
  const url = new URL(databaseUrl)
  const scheme = url.protocol.slice(0, -1)
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""))

  assertPostgresScheme(scheme)
  validateLocalPostgresOriginParts(url, database)

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

export const createProjectHyperdrive = (project: ProjectConfig, appDbMode: AppDbModeValue) =>
  Match.value(appDbMode).pipe(
    Match.when(AppDbMode.local, () => createLocalHyperdrive(project)),
    Match.when(AppDbMode.remote, () => createRemoteHyperdrive(project)),
    Match.exhaustive,
  )

function createLocalHyperdrive(project: ProjectConfig) {
  return Effect.gen(function* () {
    const context = yield* Alchemy.AlchemyContext
    const isNotDevMode = Effect.succeed(!context.dev)
    yield* Effect.die(new Error("APP_DB_MODE=local is only supported with `alchemy dev`.")).pipe(
      Effect.when(isNotDevMode),
      Effect.asVoid,
    )

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
