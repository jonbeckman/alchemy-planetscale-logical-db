import crypto from "node:crypto"
import type { PostgresOrigin } from "alchemy/Planetscale"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Redacted from "effect/Redacted"
import { Client, type QueryResultRow } from "pg"
import type { SqlFile } from "./SqlFile.ts"

type TrackedSqlFileAction = "reject" | "reapply"

const POSTGRES_IDENTIFIER = /^[a-z][a-z0-9_]*$/

export interface PostgresLogicalDatabaseOwner {
  readonly logicalId: string
  readonly resourceType: string
  readonly version: number
}

export interface AppRolePrivilegeState {
  readonly hash: string
  readonly ready: boolean
}

const validateIdentifier = (label: string, value: string) => {
  if (!POSTGRES_IDENTIFIER.test(value)) {
    throw new Error(
      `${label} "${value}" must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`,
    )
  }
}

const quoteIdentifier = (value: string) => {
  validateIdentifier("Postgres identifier", value)
  return `"${value}"`
}

const quoteExternalIdentifier = (label: string, value: string) => {
  if (value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} "${value}" must be a non-empty Postgres identifier.`)
  }
  return `"${value.replaceAll('"', '""')}"`
}

const quoteQualifiedIdentifier = (schema: string, value: string) =>
  `${quoteIdentifier(schema)}.${quoteIdentifier(value)}`

const postgresErrorCode = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined

const hashJson = (value: unknown) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")

const originConnectionUrl = (origin: PostgresOrigin, database: string) => {
  const url = new URL(`${origin.scheme}://localhost`)
  url.hostname = origin.host
  url.port = String(origin.port)
  url.username = origin.user
  url.password = Redacted.value(origin.password)
  url.pathname = `/${database}`
  url.searchParams.set("sslmode", "verify-full")
  return url.toString()
}

const stripPgSslQueryParams = (uri: string): string => {
  if (!URL.canParse(uri)) {
    return uri
  }

  const url = new URL(uri)
  url.searchParams.delete("sslmode")
  url.searchParams.delete("channel_binding")
  return url.toString()
}

const query = <Row extends QueryResultRow = QueryResultRow>(
  client: Client,
  text: string,
  values?: unknown[],
) =>
  Effect.tryPromise({
    try: () => client.query<Row>(text, values),
    catch: (error) => error,
  })

const connectPostgresClient = (client: Client) =>
  Effect.tryPromise({
    try: () => client.connect(),
    catch: (error) => error,
  }).pipe(Effect.map(() => client))

const closePostgresClient = (client: Client) =>
  Effect.tryPromise({
    try: () => client.end(),
    catch: (error) => error,
  }).pipe(Effect.asVoid)

const validateIdentifierEffect = (label: string, value: string) =>
  Effect.try({
    try: () => validateIdentifier(label, value),
    catch: (error) => error,
  })

const quoteExternalIdentifierEffect = (label: string, value: string) =>
  Effect.try({
    try: () => quoteExternalIdentifier(label, value),
    catch: (error) => error,
  })

const withPostgresClient = <A, E, R>(
  origin: PostgresOrigin,
  database: string,
  use: (client: Client) => Effect.Effect<A, E, R>,
) =>
  Effect.acquireUseRelease(
    connectPostgresClient(
      new Client({
        connectionString: stripPgSslQueryParams(originConnectionUrl(origin, database)),
        ssl: { rejectUnauthorized: true },
      }),
    ),
    use,
    (client) => closePostgresClient(client),
  )

const createDatabase = (client: Client, databaseName: string) =>
  query(
    client,
    `CREATE DATABASE ${quoteIdentifier(databaseName)} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`,
  ).pipe(
    Effect.asVoid,
    Effect.catchIf(
      (error) => postgresErrorCode(error) === "42P04",
      () => Effect.void,
    ),
  )

export const databaseExists = (origin: PostgresOrigin, databaseName: string) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", databaseName)

    return yield* withPostgresClient(origin, "postgres", function (client) {
      return query<{ exists: boolean }>(
        client,
        "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
        [databaseName],
      ).pipe(Effect.map(({ rows }) => rows[0]?.exists === true))
    })
  })

export const ensureDatabase = (origin: PostgresOrigin, databaseName: string) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", databaseName)

    yield* withPostgresClient(origin, "postgres", function (client) {
      return Effect.gen(function* () {
        const { rows } = yield* query<{ exists: boolean }>(
          client,
          "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
          [databaseName],
        )

        if (rows[0]?.exists !== true) {
          yield* createDatabase(client, databaseName)
        }
      })
    })
  })

export const dropDatabase = (origin: PostgresOrigin, databaseName: string) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", databaseName)

    yield* withPostgresClient(origin, "postgres", function (client) {
      return Effect.gen(function* () {
        const { rows } = yield* query<{ exists: boolean }>(
          client,
          "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
          [databaseName],
        )

        if (rows[0]?.exists === true) {
          yield* query(
            client,
            `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
          )
        }
      })
    })
  })

export const readDatabaseOwnership = (input: {
  readonly databaseName: string
  readonly origin: PostgresOrigin
  readonly ownerResourceType: string
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* validateIdentifierEffect("Postgres ownership table", input.tableName)

    return yield* withPostgresClient(input.origin, input.databaseName, function (client) {
      return Effect.gen(function* () {
        const exists = yield* query<{ exists: boolean }>(
          client,
          "SELECT to_regclass($1) IS NOT NULL AS exists",
          [`public.${input.tableName}`],
        )

        if (exists.rows[0]?.exists !== true) return undefined

        const owners = yield* query<PostgresLogicalDatabaseOwner>(
          client,
          `SELECT logical_id AS "logicalId", resource_type AS "resourceType", owner_version AS "version"
       FROM ${quoteIdentifier(input.tableName)}
       WHERE resource_type = $1
       LIMIT 1`,
          [input.ownerResourceType],
        )

        return owners.rows[0]
      })
    })
  })

export const ensureDatabaseOwnership = (input: {
  readonly databaseName: string
  readonly origin: PostgresOrigin
  readonly owner: PostgresLogicalDatabaseOwner
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* validateIdentifierEffect("Postgres ownership table", input.tableName)

    const table = quoteIdentifier(input.tableName)

    yield* withPostgresClient(input.origin, input.databaseName, function (client) {
      return Effect.gen(function* () {
        yield* query(
          client,
          `
      CREATE TABLE IF NOT EXISTS ${table} (
        resource_type text PRIMARY KEY,
        logical_id text NOT NULL,
        owner_version integer NOT NULL,
        claimed_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `,
        )

        yield* query(
          client,
          `INSERT INTO ${table} (resource_type, logical_id, owner_version)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource_type) DO UPDATE
       SET logical_id = excluded.logical_id,
           owner_version = excluded.owner_version,
           updated_at = now()`,
          [input.owner.resourceType, input.owner.logicalId, input.owner.version],
        )
      })
    })
  })

export const readTrackedSqlFileHashes = (input: {
  readonly databaseName: string
  readonly origin: PostgresOrigin
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* validateIdentifierEffect("Postgres tracking table", input.tableName)

    return yield* withPostgresClient(input.origin, input.databaseName, function (client) {
      return Effect.gen(function* () {
        const exists = yield* query<{ exists: boolean }>(
          client,
          "SELECT to_regclass($1) IS NOT NULL AS exists",
          [`public.${input.tableName}`],
        )

        if (exists.rows[0]?.exists !== true) return {}

        const hashes = yield* query<{ name: string; hash: string }>(
          client,
          `SELECT name, hash FROM ${quoteIdentifier(input.tableName)} ORDER BY name`,
        )

        return Object.fromEntries(hashes.rows.map((row) => [row.name, row.hash]))
      })
    })
  })

const readExistingTrackedSqlFileHashes = (client: Client, tableName: string) =>
  query<{ name: string; hash: string }>(
    client,
    `SELECT name, hash FROM ${quoteIdentifier(tableName)} ORDER BY name`,
  ).pipe(Effect.map((hashes) => Object.fromEntries(hashes.rows.map((row) => [row.name, row.hash]))))

export const removedRecordNames = (
  desiredFiles: readonly Pick<SqlFile, "id">[],
  existingRecords: Record<string, string>,
) => {
  const desiredNames = new Set(desiredFiles.map((file) => file.id))
  return Object.keys(existingRecords)
    .filter((name) => !desiredNames.has(name))
    .sort()
}

const rejectRemovedTrackedSqlFiles = (tableName: string, removedNames: readonly string[]) =>
  removedNames.length > 0
    ? Effect.fail(
        new Error(
          `Refusing to remove tracked SQL file records from ${tableName}: ${removedNames.join(
            ", ",
          )}. Create a new forward migration/import instead.`,
        ),
      )
    : Effect.void

const transaction = <A, E, R>(client: Client, use: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    query(client, "BEGIN"),
    () => use,
    (_begin, exit) =>
      Exit.match(exit, {
        onSuccess: () => query(client, "COMMIT").pipe(Effect.asVoid),
        onFailure: () => query(client, "ROLLBACK").pipe(Effect.ignore),
      }),
  )

const applyTrackedSqlFile = (input: {
  readonly changedFileAction: TrackedSqlFileAction
  readonly client: Client
  readonly file: SqlFile
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    const existing = yield* query<{ hash: string }>(
      input.client,
      `SELECT hash FROM ${quoteIdentifier(input.tableName)} WHERE name = $1`,
      [input.file.id],
    )
    const existingHash = existing.rows[0]?.hash

    if (existingHash === input.file.hash) return

    if (existingHash && input.changedFileAction === "reject") {
      return yield* Effect.fail(
        new Error(
          `Refusing to reapply changed SQL file ${input.file.id}; create a new migration/import file instead.`,
        ),
      )
    }

    yield* transaction(
      input.client,
      Effect.gen(function* () {
        yield* query(input.client, input.file.sql)
        yield* query(
          input.client,
          `INSERT INTO ${quoteIdentifier(input.tableName)} (name, hash)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET hash = excluded.hash, applied_at = now()`,
          [input.file.id, input.file.hash],
        )
      }),
    )
  })

const applyChangedTrackedSqlFiles = (input: {
  readonly changedFileAction: TrackedSqlFileAction
  readonly client: Client
  readonly files: readonly SqlFile[]
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* query(
      input.client,
      `
    CREATE TABLE IF NOT EXISTS ${quoteIdentifier(input.tableName)} (
      name text PRIMARY KEY,
      hash text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `,
    )

    yield* Effect.forEach(
      input.files,
      (file) =>
        applyTrackedSqlFile({
          changedFileAction: input.changedFileAction,
          client: input.client,
          file,
          tableName: input.tableName,
        }),
      { concurrency: 1, discard: true },
    )
  })

export const applyTrackedSqlFiles = (input: {
  readonly changedFileAction: TrackedSqlFileAction
  readonly databaseName: string
  readonly files: readonly SqlFile[]
  readonly origin: PostgresOrigin
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* validateIdentifierEffect("Postgres tracking table", input.tableName)

    yield* withPostgresClient(input.origin, input.databaseName, function (client) {
      return Effect.gen(function* () {
        const exists = yield* query<{ exists: boolean }>(
          client,
          "SELECT to_regclass($1) IS NOT NULL AS exists",
          [`public.${input.tableName}`],
        )
        const existingHashes =
          exists.rows[0]?.exists === true
            ? yield* readExistingTrackedSqlFileHashes(client, input.tableName)
            : {}
        yield* rejectRemovedTrackedSqlFiles(
          input.tableName,
          removedRecordNames(input.files, existingHashes),
        )

        if (input.files.length > 0) {
          yield* applyChangedTrackedSqlFiles({
            changedFileAction: input.changedFileAction,
            client,
            files: input.files,
            tableName: input.tableName,
          })
        }
      })
    })
  })

export const ensureAppRolePrivileges = (input: {
  readonly databaseName: string
  readonly excludedTableNames: readonly string[]
  readonly origin: PostgresOrigin
  readonly roleName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* Effect.forEach(
      input.excludedTableNames,
      (tableName) => validateIdentifierEffect("Postgres excluded table", tableName),
      { concurrency: 1, discard: true },
    )

    const database = quoteIdentifier(input.databaseName)
    const role = yield* quoteExternalIdentifierEffect("Postgres role", input.roleName)

    yield* withPostgresClient(input.origin, input.databaseName, function (client) {
      return Effect.gen(function* () {
        yield* query(client, `REVOKE CONNECT ON DATABASE ${database} FROM PUBLIC`)
        yield* query(client, `GRANT CONNECT, TEMPORARY ON DATABASE ${database} TO ${role}`)
        yield* query(client, `GRANT USAGE ON SCHEMA public TO ${role}`)
        yield* query(
          client,
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
        )
        yield* query(
          client,
          `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${role}`,
        )
        yield* query(
          client,
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role}`,
        )
        yield* query(
          client,
          `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${role}`,
        )

        yield* Effect.forEach(
          [...new Set(input.excludedTableNames)],
          (tableName) =>
            Effect.gen(function* () {
              const table = quoteQualifiedIdentifier("public", tableName)
              const exists = yield* query<{ exists: boolean }>(
                client,
                "SELECT to_regclass($1) IS NOT NULL AS exists",
                [`public.${tableName}`],
              )
              if (exists.rows[0]?.exists === true) {
                yield* query(client, `REVOKE ALL PRIVILEGES ON TABLE ${table} FROM ${role}`)
              }
            }),
          { concurrency: 1, discard: true },
        )
      })
    })
  })

export const readAppRolePrivileges = (input: {
  readonly databaseName: string
  readonly excludedTableNames: readonly string[]
  readonly origin: PostgresOrigin
  readonly roleName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* Effect.forEach(
      input.excludedTableNames,
      (tableName) => validateIdentifierEffect("Postgres excluded table", tableName),
      { concurrency: 1, discard: true },
    )

    const excludedTables = new Set(input.excludedTableNames)

    return yield* withPostgresClient(input.origin, input.databaseName, function (client) {
      return Effect.gen(function* () {
        const roleRows = yield* query<{ oid: string }>(
          client,
          "SELECT oid::text AS oid FROM pg_roles WHERE rolname = $1",
          [input.roleName],
        )
        const roleOid = roleRows.rows[0]?.oid

        if (!roleOid) {
          const checks = [{ name: `role:${input.roleName}:exists`, ok: false }]
          return {
            hash: hashJson(checks),
            ready: false,
          }
        }

        const databaseChecks = yield* query<{ name: string; ok: boolean }>(
          client,
          `SELECT 'database:connect' AS name,
              has_database_privilege($1::oid, current_database(), 'CONNECT') AS ok
       UNION ALL
       SELECT 'database:temporary' AS name,
              has_database_privilege($1::oid, current_database(), 'TEMPORARY') AS ok
       UNION ALL
       SELECT 'schema:public:usage' AS name,
              has_schema_privilege($1::oid, 'public', 'USAGE') AS ok`,
          [roleOid],
        )

        const tableChecks = yield* query<{
          granted: boolean
          privilege: string
          tableName: string
        }>(
          client,
          `WITH privileges(privilege) AS (
         VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
       ),
       tables AS (
         SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_type = 'BASE TABLE'
       )
       SELECT
         has_table_privilege(
           $1::oid,
           format('%I.%I', tables.table_schema, tables.table_name),
           privileges.privilege
         ) AS granted,
         privileges.privilege,
         tables.table_name AS "tableName"
       FROM tables
       CROSS JOIN privileges
       ORDER BY tables.table_name, privileges.privilege`,
          [roleOid],
        )

        const sequenceChecks = yield* query<{
          granted: boolean
          privilege: string
          sequenceName: string
        }>(
          client,
          `WITH privileges(privilege) AS (
         VALUES ('USAGE'), ('SELECT'), ('UPDATE')
       )
       SELECT
         has_sequence_privilege(
           $1::oid,
           format('%I.%I', sequences.sequence_schema, sequences.sequence_name),
           privileges.privilege
         ) AS granted,
         privileges.privilege,
         sequences.sequence_name AS "sequenceName"
       FROM information_schema.sequences
       CROSS JOIN privileges
       WHERE sequences.sequence_schema = 'public'
       ORDER BY sequences.sequence_name, privileges.privilege`,
          [roleOid],
        )

        const defaultPrivilegeChecks = yield* query<{
          granted: boolean
          objectType: string
          privilege: string
        }>(
          client,
          `WITH desired(object_type, privilege) AS (
         VALUES
           ('r', 'SELECT'),
           ('r', 'INSERT'),
           ('r', 'UPDATE'),
           ('r', 'DELETE'),
           ('S', 'USAGE'),
           ('S', 'SELECT'),
           ('S', 'UPDATE')
       )
       SELECT
         EXISTS (
           SELECT 1
           FROM pg_default_acl default_acl
           CROSS JOIN LATERAL aclexplode(default_acl.defaclacl) acl
           WHERE default_acl.defaclnamespace = 'public'::regnamespace
             AND default_acl.defaclrole = current_user::regrole
             AND default_acl.defaclobjtype = desired.object_type
             AND acl.grantee = $1::oid
             AND acl.privilege_type = desired.privilege
         ) AS granted,
         desired.object_type AS "objectType",
         desired.privilege
       FROM desired
       ORDER BY desired.object_type, desired.privilege`,
          [roleOid],
        )

        const checks = [
          ...databaseChecks.rows,
          ...tableChecks.rows.map((check) => ({
            name: `table:${check.tableName}:${check.privilege.toLowerCase()}`,
            ok: excludedTables.has(check.tableName) ? !check.granted : check.granted,
          })),
          ...sequenceChecks.rows.map((check) => ({
            name: `sequence:${check.sequenceName}:${check.privilege.toLowerCase()}`,
            ok: check.granted,
          })),
          ...defaultPrivilegeChecks.rows.map((check) => ({
            name: `default:${check.objectType}:${check.privilege.toLowerCase()}`,
            ok: check.granted,
          })),
        ]
        const sortedChecks = checks.sort((a, b) => a.name.localeCompare(b.name))
        return {
          hash: hashJson(sortedChecks),
          ready: sortedChecks.every((check) => check.ok),
        }
      })
    })
  })
