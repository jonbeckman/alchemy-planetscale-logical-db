import type { PostgresOrigin } from "alchemy/Planetscale"
import { sha256Object } from "alchemy/Util/sha256"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as HashSet from "effect/HashSet"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as P from "effect/Predicate"
import * as R from "effect/Record"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Client, type QueryResultRow } from "pg"
import type { SqlFile } from "./SqlFile.ts"

type TrackedSqlFileAction = "reject" | "reapply"

const POSTGRES_IDENTIFIER = /^[a-z][a-z0-9_]*$/

class TrackedSqlFileError extends Schema.TaggedErrorClass<TrackedSqlFileError>()(
  "TrackedSqlFileError",
  {
    message: Schema.String,
  },
) {}

export interface PostgresLogicalDatabaseOwner {
  readonly logicalId: string
  readonly resourceType: string
  readonly version: number
}

export interface AppRolePrivilegeState {
  readonly hash: string
  readonly ready: boolean
}

interface PrivilegeCheck {
  readonly name: string
  readonly ok: boolean
}

function throwInvalidIdentifier(label: string, value: string): never {
  throw new Error(
    `${label} "${value}" must start with a lowercase letter and contain only lowercase letters, numbers, and underscores.`,
  )
}

const validateIdentifier = (label: string, value: string) =>
  Match.value(POSTGRES_IDENTIFIER.test(value)).pipe(
    Match.when(true, () => undefined),
    Match.when(false, () => throwInvalidIdentifier(label, value)),
    Match.exhaustive,
  )

function quoteIdentifier(value: string) {
  validateIdentifier("Postgres identifier", value)
  return `"${value}"`
}

const validateExternalIdentifier = (label: string, value: string) =>
  Match.value(value !== "" && !value.includes("\0")).pipe(
    Match.when(true, () => undefined),
    Match.when(false, () => throwInvalidExternalIdentifier(label, value)),
    Match.exhaustive,
  )

function throwInvalidExternalIdentifier(label: string, value: string): never {
  throw new Error(`${label} "${value}" must be a non-empty Postgres identifier.`)
}

function quoteExternalIdentifier(label: string, value: string) {
  validateExternalIdentifier(label, value)
  return `"${value.replaceAll('"', '""')}"`
}

const quoteQualifiedIdentifier = (schema: string, value: string) =>
  `${quoteIdentifier(schema)}.${quoteIdentifier(value)}`

const postgresErrorCode = (error: unknown) =>
  Option.liftPredicate(error, P.isObject).pipe(
    Option.filter((value) => "code" in value),
    Option.map((value) => String((value as { code?: unknown }).code)),
    Option.getOrUndefined,
  )

const hashJson = (value: object) => sha256Object(value)

function originConnectionUrl(origin: PostgresOrigin, database: string) {
  const url = new URL(`${origin.scheme}://localhost`)
  url.hostname = origin.host
  url.port = String(origin.port)
  url.username = origin.user
  url.password = Redacted.value(origin.password)
  url.pathname = `/${database}`
  url.searchParams.set("sslmode", "verify-full")
  return url.toString()
}

function removePgSslQueryParams(uri: string) {
  const url = new URL(uri)
  url.searchParams.delete("sslmode")
  url.searchParams.delete("channel_binding")
  return url.toString()
}

const stripPgSslQueryParams = (uri: string): string =>
  Match.value(URL.canParse(uri)).pipe(
    Match.when(true, () => removePgSslQueryParams(uri)),
    Match.when(false, () => uri),
    Match.exhaustive,
  )

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

const withPostgresClient = <Use extends (client: Client) => Effect.All.EffectAny>(
  origin: PostgresOrigin,
  database: string,
  use: Use,
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

const queryExists = (client: Client, tableName: string) =>
  query<{ exists: boolean }>(client, "SELECT to_regclass($1) IS NOT NULL AS exists", [
    `public.${tableName}`,
  ]).pipe(Effect.map(({ rows }) => rows[0]?.exists === true))

function createDatabaseWhenMissing(
  client: Client,
  databaseName: string,
  rows: readonly { readonly exists: boolean }[],
) {
  const missing = Effect.succeed(rows[0]?.exists !== true)
  return createDatabase(client, databaseName).pipe(Effect.when(missing), Effect.asVoid)
}

function dropDatabaseWhenPresent(
  client: Client,
  databaseName: string,
  rows: readonly { readonly exists: boolean }[],
) {
  const present = Effect.succeed(rows[0]?.exists === true)
  return query(
    client,
    `DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`,
  ).pipe(Effect.when(present), Effect.asVoid)
}

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

    return yield* withPostgresClient(origin, "postgres", (client) =>
      query<{ exists: boolean }>(
        client,
        "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
        [databaseName],
      ).pipe(Effect.map(({ rows }) => rows[0]?.exists === true)),
    )
  })

export const ensureDatabase = (origin: PostgresOrigin, databaseName: string) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", databaseName)

    yield* withPostgresClient(origin, "postgres", (client) =>
      query<{ exists: boolean }>(
        client,
        "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
        [databaseName],
      ).pipe(Effect.flatMap(({ rows }) => createDatabaseWhenMissing(client, databaseName, rows))),
    )
  })

export const dropDatabase = (origin: PostgresOrigin, databaseName: string) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", databaseName)

    yield* withPostgresClient(origin, "postgres", (client) =>
      query<{ exists: boolean }>(
        client,
        "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
        [databaseName],
      ).pipe(Effect.flatMap(({ rows }) => dropDatabaseWhenPresent(client, databaseName, rows))),
    )
  })

function readDatabaseOwnershipWhenTableExists(
  client: Client,
  input: {
    readonly ownerResourceType: string
    readonly tableName: string
  },
  exists: boolean,
) {
  const tableExists = Effect.succeed(exists)
  return query<PostgresLogicalDatabaseOwner>(
    client,
    `SELECT logical_id AS "logicalId", resource_type AS "resourceType", owner_version AS "version"
       FROM ${quoteIdentifier(input.tableName)}
       WHERE resource_type = $1
       LIMIT 1`,
    [input.ownerResourceType],
  ).pipe(
    Effect.map(({ rows }) => Option.fromUndefinedOr(rows[0])),
    Effect.when(tableExists),
    Effect.map(Option.flatten),
    Effect.map(Option.getOrUndefined),
  )
}

export const readDatabaseOwnership = (input: {
  readonly databaseName: string
  readonly origin: PostgresOrigin
  readonly ownerResourceType: string
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* validateIdentifierEffect("Postgres ownership table", input.tableName)

    return yield* withPostgresClient(input.origin, input.databaseName, (client) =>
      queryExists(client, input.tableName).pipe(
        Effect.flatMap((exists) => readDatabaseOwnershipWhenTableExists(client, input, exists)),
      ),
    )
  })

const ensureDatabaseOwnershipWithClient = (input: {
  readonly client: Client
  readonly owner: PostgresLogicalDatabaseOwner
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    const table = quoteIdentifier(input.tableName)
    yield* query(
      input.client,
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
      input.client,
      `INSERT INTO ${table} (resource_type, logical_id, owner_version)
       VALUES ($1, $2, $3)
       ON CONFLICT (resource_type) DO UPDATE
       SET logical_id = excluded.logical_id,
           owner_version = excluded.owner_version,
           updated_at = now()`,
      [input.owner.resourceType, input.owner.logicalId, input.owner.version],
    )
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

    yield* withPostgresClient(input.origin, input.databaseName, (client) =>
      ensureDatabaseOwnershipWithClient({ client, owner: input.owner, tableName: input.tableName }),
    )
  })

function trackedSqlFileHashesWhenTableExists(client: Client, tableName: string, exists: boolean) {
  const tableExists = Effect.succeed(exists)
  return readExistingTrackedSqlFileHashes(client, tableName).pipe(
    Effect.when(tableExists),
    Effect.map(Option.getOrElse(() => ({}))),
  )
}

export const readTrackedSqlFileHashes = (input: {
  readonly databaseName: string
  readonly origin: PostgresOrigin
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    yield* validateIdentifierEffect("Postgres database", input.databaseName)
    yield* validateIdentifierEffect("Postgres tracking table", input.tableName)

    return yield* withPostgresClient(input.origin, input.databaseName, (client) =>
      queryExists(client, input.tableName).pipe(
        Effect.flatMap((exists) =>
          trackedSqlFileHashesWhenTableExists(client, input.tableName, exists),
        ),
      ),
    )
  })

const readExistingTrackedSqlFileHashes = (client: Client, tableName: string) =>
  query<{ name: string; hash: string }>(
    client,
    `SELECT name, hash FROM ${quoteIdentifier(tableName)} ORDER BY name`,
  ).pipe(Effect.map((hashes) => R.fromEntries(hashes.rows.map((row) => [row.name, row.hash]))))

export function removedRecordNames(
  desiredFiles: readonly Pick<SqlFile, "id">[],
  existingRecords: Record<string, string>,
) {
  const desiredNames = HashSet.fromIterable(desiredFiles.map((file) => file.id))
  return Arr.sort(
    R.keys(existingRecords).filter((name) => !HashSet.has(desiredNames, name)),
    Order.String,
  )
}

const rejectRemovedTrackedSqlFiles = (tableName: string, removedNames: readonly string[]) =>
  Arr.match(removedNames, {
    onEmpty: () => Effect.void,
    onNonEmpty: (names) =>
      Effect.fail(
        new TrackedSqlFileError({
          message: `Refusing to remove tracked SQL file records from ${tableName}: ${names.join(
            ", ",
          )}. Create a new forward migration/import instead.`,
        }),
      ),
  })

const transaction = <Use extends Effect.All.EffectAny>(client: Client, use: Use) =>
  Effect.acquireUseRelease(
    query(client, "BEGIN"),
    () => use,
    (_begin, exit) =>
      Exit.match(exit, {
        onSuccess: () => query(client, "COMMIT").pipe(Effect.asVoid),
        onFailure: () => query(client, "ROLLBACK").pipe(Effect.ignore),
      }),
  )

const writeTrackedSqlFileTransaction = Effect.fn("writeTrackedSqlFileTransaction")(
  function* (input: {
    readonly client: Client
    readonly file: SqlFile
    readonly tableName: string
  }) {
    yield* query(input.client, input.file.sql)
    yield* query(
      input.client,
      `INSERT INTO ${quoteIdentifier(input.tableName)} (name, hash)
       VALUES ($1, $2)
       ON CONFLICT (name) DO UPDATE SET hash = excluded.hash, applied_at = now()`,
      [input.file.id, input.file.hash],
    )
  },
)

function writeTrackedSqlFile(input: {
  readonly client: Client
  readonly file: SqlFile
  readonly tableName: string
}) {
  return transaction(input.client, writeTrackedSqlFileTransaction(input))
}

const changedSqlFileError = (file: SqlFile) =>
  new TrackedSqlFileError({
    message: `Refusing to reapply changed SQL file ${file.id}; create a new migration/import file instead.`,
  })

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
    const existingHash = Option.fromUndefinedOr(existing.rows[0]?.hash)
    const changed = existingHash.pipe(
      Option.match({
        onSome: (hash) => hash !== input.file.hash,
        onNone: () => true,
      }),
    )
    const rejectsChangedFile = changed && input.changedFileAction === "reject"
    const shouldWrite = changed && !rejectsChangedFile
    const rejectChange = Effect.fail(changedSqlFileError(input.file))
    const writeChange = writeTrackedSqlFile(input)
    const rejectsChangedFileEffect = Effect.succeed(rejectsChangedFile)
    const shouldWriteEffect = Effect.succeed(shouldWrite)
    yield* rejectChange.pipe(Effect.when(rejectsChangedFileEffect), Effect.asVoid)
    yield* writeChange.pipe(Effect.when(shouldWriteEffect), Effect.asVoid)
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

const existingTrackedSqlFileHashes = (client: Client, tableName: string) =>
  queryExists(client, tableName).pipe(
    Effect.flatMap((exists) => trackedSqlFileHashesWhenTableExists(client, tableName, exists)),
  )

const applyTrackedSqlFilesWithClient = (input: {
  readonly changedFileAction: TrackedSqlFileAction
  readonly client: Client
  readonly files: readonly SqlFile[]
  readonly tableName: string
}) =>
  Effect.gen(function* () {
    const existingHashes = yield* existingTrackedSqlFileHashes(input.client, input.tableName)
    yield* rejectRemovedTrackedSqlFiles(
      input.tableName,
      removedRecordNames(input.files, existingHashes),
    )
    yield* Arr.match(input.files, {
      onEmpty: () => Effect.void,
      onNonEmpty: (files) =>
        applyChangedTrackedSqlFiles({
          changedFileAction: input.changedFileAction,
          client: input.client,
          files,
          tableName: input.tableName,
        }),
    })
  })

function revokeTablePrivilegesWhenExists(
  input: {
    readonly client: Client
    readonly role: string
    readonly tableName: string
  },
  exists: boolean,
) {
  const table = quoteQualifiedIdentifier("public", input.tableName)
  const tableExists = Effect.succeed(exists)
  return query(input.client, `REVOKE ALL PRIVILEGES ON TABLE ${table} FROM ${input.role}`).pipe(
    Effect.when(tableExists),
  )
}

function revokeExcludedTablePrivileges(input: {
  readonly client: Client
  readonly role: string
  readonly tableName: string
}) {
  return queryExists(input.client, input.tableName).pipe(
    Effect.flatMap((exists) => revokeTablePrivilegesWhenExists(input, exists)),
    Effect.asVoid,
  )
}

const ensureAppRolePrivilegesWithClient = (input: {
  readonly client: Client
  readonly database: string
  readonly excludedTableNames: readonly string[]
  readonly role: string
}) =>
  Effect.gen(function* () {
    yield* query(input.client, `REVOKE CONNECT ON DATABASE ${input.database} FROM PUBLIC`)
    yield* query(
      input.client,
      `GRANT CONNECT, TEMPORARY ON DATABASE ${input.database} TO ${input.role}`,
    )
    yield* query(input.client, `GRANT USAGE ON SCHEMA public TO ${input.role}`)
    yield* query(
      input.client,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${input.role}`,
    )
    yield* query(
      input.client,
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${input.role}`,
    )
    yield* query(
      input.client,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${input.role}`,
    )
    yield* query(
      input.client,
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${input.role}`,
    )

    yield* Effect.forEach(
      Arr.fromIterable(HashSet.fromIterable(input.excludedTableNames)),
      (tableName) => revokeExcludedTablePrivileges({ ...input, tableName }),
      { concurrency: 1, discard: true },
    )
  })

const privilegeCheckOrder = Order.mapInput(Order.String, (check: PrivilegeCheck) => check.name)

const appRoleMissingPrivilegeState = (roleName: string) =>
  Effect.gen(function* () {
    const checks = [{ name: `role:${roleName}:exists`, ok: false }]
    return {
      hash: yield* hashJson(checks),
      ready: false,
    } satisfies AppRolePrivilegeState
  })

const tablePrivilegeCheck = (
  excludedTables: HashSet.HashSet<string>,
  check: {
    readonly granted: boolean
    readonly privilege: string
    readonly tableName: string
  },
): PrivilegeCheck => ({
  name: `table:${check.tableName}:${check.privilege.toLowerCase()}`,
  ok: Match.value(HashSet.has(excludedTables, check.tableName)).pipe(
    Match.when(true, () => !check.granted),
    Match.when(false, () => check.granted),
    Match.exhaustive,
  ),
})

const sequencePrivilegeCheck = (check: {
  readonly granted: boolean
  readonly privilege: string
  readonly sequenceName: string
}): PrivilegeCheck => ({
  name: `sequence:${check.sequenceName}:${check.privilege.toLowerCase()}`,
  ok: check.granted,
})

const defaultPrivilegeCheck = (check: {
  readonly granted: boolean
  readonly objectType: string
  readonly privilege: string
}): PrivilegeCheck => ({
  name: `default:${check.objectType}:${check.privilege.toLowerCase()}`,
  ok: check.granted,
})

const appRolePrivilegeState = (checks: readonly PrivilegeCheck[]) =>
  Effect.gen(function* () {
    const sortedChecks = Arr.sort(checks, privilegeCheckOrder)
    return {
      hash: yield* hashJson(sortedChecks),
      ready: sortedChecks.every((check) => check.ok),
    } satisfies AppRolePrivilegeState
  })

const readExistingAppRolePrivileges = (input: {
  readonly client: Client
  readonly excludedTables: HashSet.HashSet<string>
  readonly roleOid: string
}) =>
  Effect.gen(function* () {
    const databaseChecks = yield* query<{ name: string; ok: boolean }>(
      input.client,
      `SELECT 'database:connect' AS name,
              has_database_privilege($1::oid, current_database(), 'CONNECT') AS ok
       UNION ALL
       SELECT 'database:temporary' AS name,
              has_database_privilege($1::oid, current_database(), 'TEMPORARY') AS ok
       UNION ALL
       SELECT 'schema:public:usage' AS name,
              has_schema_privilege($1::oid, 'public', 'USAGE') AS ok`,
      [input.roleOid],
    )

    const tableChecks = yield* query<{
      granted: boolean
      privilege: string
      tableName: string
    }>(
      input.client,
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
      [input.roleOid],
    )

    const sequenceChecks = yield* query<{
      granted: boolean
      privilege: string
      sequenceName: string
    }>(
      input.client,
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
      [input.roleOid],
    )

    const defaultPrivilegeChecks = yield* query<{
      granted: boolean
      objectType: string
      privilege: string
    }>(
      input.client,
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
      [input.roleOid],
    )

    return yield* appRolePrivilegeState([
      ...databaseChecks.rows,
      ...tableChecks.rows.map((check) => tablePrivilegeCheck(input.excludedTables, check)),
      ...sequenceChecks.rows.map(sequencePrivilegeCheck),
      ...defaultPrivilegeChecks.rows.map(defaultPrivilegeCheck),
    ])
  })

const readAppRolePrivilegesWithClient = (input: {
  readonly client: Client
  readonly excludedTables: HashSet.HashSet<string>
  readonly roleName: string
}) =>
  Effect.gen(function* () {
    const roleRows = yield* query<{ oid: string }>(
      input.client,
      "SELECT oid::text AS oid FROM pg_roles WHERE rolname = $1",
      [input.roleName],
    )
    return yield* Option.fromUndefinedOr(roleRows.rows[0]?.oid).pipe(
      Option.match({
        onSome: (roleOid) =>
          readExistingAppRolePrivileges({
            client: input.client,
            excludedTables: input.excludedTables,
            roleOid,
          }),
        onNone: () => appRoleMissingPrivilegeState(input.roleName),
      }),
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

    yield* withPostgresClient(input.origin, input.databaseName, (client) =>
      applyTrackedSqlFilesWithClient({ ...input, client }),
    )
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

    yield* withPostgresClient(input.origin, input.databaseName, (client) =>
      ensureAppRolePrivilegesWithClient({
        client,
        database,
        excludedTableNames: input.excludedTableNames,
        role,
      }),
    )
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

    const excludedTables = HashSet.fromIterable(input.excludedTableNames)

    return yield* withPostgresClient(input.origin, input.databaseName, (client) =>
      readAppRolePrivilegesWithClient({
        client,
        excludedTables,
        roleName: input.roleName,
      }),
    )
  })
