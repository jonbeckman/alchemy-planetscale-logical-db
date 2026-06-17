import { Unowned } from "alchemy/AdoptPolicy"
import { isResolved } from "alchemy/Diff"
import { createPhysicalName } from "alchemy/PhysicalName"
import * as Provider from "alchemy/Provider"
import { Resource } from "alchemy/Resource"
import type { PostgresOrigin } from "alchemy/Planetscale"
import {
  applyTrackedSqlFiles,
  databaseExists,
  dropDatabase,
  ensureAppRolePrivileges,
  ensureDatabase,
  ensureDatabaseOwnership,
  readAppRolePrivileges,
  readDatabaseOwnership,
  readTrackedSqlFileHashes,
  type AppRolePrivilegeState,
  type PostgresLogicalDatabaseOwner,
} from "./PostgresLogicalDatabaseClient.ts"
import { listSqlFiles, readSqlFile, type SqlFile } from "./SqlFile.ts"
import type { Providers } from "./Providers.ts"
import { recordsEqual } from "./recordsEqual.ts"
import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as P from "effect/Predicate"
import * as R from "effect/Record"

const DEFAULT_MIGRATIONS_TABLE = "__alchemy_migrations"
const DEFAULT_IMPORTS_TABLE = "__alchemy_imports"
const DEFAULT_OWNERSHIP_TABLE = "__alchemy_logical_database_ownership"
const DEFAULT_APP_ROLE_PRIVILEGES_VERSION = 0
const POSTGRES_LOGICAL_DATABASE_RESOURCE_TYPE = "Planetscale.PostgresLogicalDatabase"
const POSTGRES_LOGICAL_DATABASE_OWNER_VERSION = 1
const updateAction = () => ({ action: "update" }) as const

const optionalString = (value: string | undefined): Option.Option<string> =>
  Option.fromUndefinedOr(value)

const optionalNonEmptyString = (value: string | undefined): Option.Option<string> =>
  optionalString(value).pipe(Option.filter((present) => present !== ""))

/**
 * Properties for creating or updating a logical PostgreSQL database inside a
 * PlanetScale PostgreSQL database branch.
 */
export interface PostgresLogicalDatabaseProps {
  /**
   * Logical PostgreSQL database name. If omitted, Alchemy generates a
   * lowercase underscore-delimited name.
   */
  name?: string

  /**
   * Admin PostgreSQL connection origin for the PlanetScale branch. Use an
   * origin from a {@link PostgresRole} that inherits `postgres`.
   */
  adminOrigin: PostgresOrigin

  /**
   * Postgres-visible application role name to grant access to this logical
   * database. PlanetScale connection usernames often contain a suffix; pass
   * the visible role prefix.
   */
  appRoleName?: string

  /**
   * Bump this value to force re-checking and re-applying application role
   * grants even when the privilege hash has not otherwise changed.
   * @default 0
   */
  appRolePrivilegesVersion?: number

  /**
   * Directory of SQL migration files to apply once. Applied file hashes are
   * tracked in the logical database and changed or removed migration records
   * are rejected.
   */
  migrationsDir?: string

  /**
   * Table used to track applied migrations.
   * @default "__alchemy_migrations"
   */
  migrationsTable?: string

  /**
   * SQL files to apply as imports/seed data. Imports are re-applied when the
   * file hash changes, while removed tracked import records are rejected.
   */
  importFiles?: ReadonlyArray<string>

  /**
   * Table used to track applied imports.
   * @default "__alchemy_imports"
   */
  importsTable?: string
}

/**
 * Output attributes of a deployed logical PostgreSQL database.
 */
export interface PostgresLogicalDatabaseAttributes {
  /** Logical PostgreSQL database name. */
  name: string
  /** Application role name that receives table and sequence grants. */
  appRoleName?: string
  /** Hash of observed app-role privilege state. */
  appRolePrivilegesHash?: string
  /** Desired application role privileges version. */
  appRolePrivilegesVersion: number
  /** Applied migration file hashes keyed by SQL file id. */
  migrationsHashes: Record<string, string>
  /** Applied import file hashes keyed by SQL file path. */
  importHashes: Record<string, string>
  /** Table used to track applied migrations. */
  migrationsTable: string
  /** Table used to track applied imports. */
  importsTable: string
  /** Ownership marker written inside the logical database. */
  owner: PostgresLogicalDatabaseOwner
  /** Table used to track Alchemy ownership. */
  ownershipTable: string
}

/**
 * A logical PostgreSQL database created inside an existing
 * {@link PostgresDatabase}.
 *
 * Use {@link PostgresDatabase} when you want a PlanetScale PostgreSQL database
 * cluster. Use this resource when that cluster should contain multiple
 * PostgreSQL databases, each with separate migrations, imports, and app-role
 * grants.
 *
 * @section Creating a Logical Database
 * @example Logical database with migrations
 * ```typescript
 * const database = yield* Planetscale.PostgresDatabase("Database", {
 *   clusterSize: "PS_10",
 * });
 *
 * const adminRole = yield* Planetscale.PostgresRole("AdminRole", {
 *   database,
 *   inheritedRoles: ["postgres"],
 * });
 *
 * const applicationRole = yield* Planetscale.PostgresRole("ApplicationRole", {
 *   database,
 *   inheritedRoles: [],
 * });
 * const applicationRoleName = PlanetscaleLogicalDb.postgresRoleNameFromUsername(
 *   applicationRole.username,
 * );
 *
 * const logicalDb = yield* PlanetscaleLogicalDb.PostgresLogicalDatabase("AppDb", {
 *   name: "app",
 *   adminOrigin: adminRole.origin,
 *   appRoleName: applicationRoleName,
 *   migrationsDir: "./migrations",
 * });
 * ```
 *
 * @section Imports
 * @example Apply seed files
 * ```typescript
 * const logicalDb = yield* PlanetscaleLogicalDb.PostgresLogicalDatabase("SeededDb", {
 *   name: "seeded",
 *   adminOrigin: adminRole.origin,
 *   importFiles: ["./seed/users.sql"],
 * });
 * ```
 */
export type PostgresLogicalDatabase = Resource<
  "Planetscale.PostgresLogicalDatabase",
  PostgresLogicalDatabaseProps,
  PostgresLogicalDatabaseAttributes,
  never,
  Providers
>

export const PostgresLogicalDatabase = Resource<PostgresLogicalDatabase>(
  "Planetscale.PostgresLogicalDatabase",
)

export const postgresRoleNameFromUsername = (username: string) => username.split(".")[0] ?? username

const ensurePostgresIdentifierPrefix = (name: string) =>
  Match.value(/^[a-z]/.test(name)).pipe(
    Match.when(true, () => name),
    Match.when(false, () => `db_${name}`.slice(0, 63)),
    Match.exhaustive,
  )

const createLogicalDatabaseName = (id: string, name: string | undefined) =>
  Arr.matchLeft(Option.toArray(optionalNonEmptyString(name)), {
    onEmpty: () =>
      createPhysicalName({
        id,
        delimiter: "_",
        lowercase: true,
        maxLength: 63,
      }).pipe(Effect.map(ensurePostgresIdentifierPrefix)),
    onNonEmpty: (value) => Effect.succeed(value),
  })

const logicalDatabaseOwner = (logicalId: string): PostgresLogicalDatabaseOwner => ({
  logicalId,
  resourceType: POSTGRES_LOGICAL_DATABASE_RESOURCE_TYPE,
  version: POSTGRES_LOGICAL_DATABASE_OWNER_VERSION,
})

const ownersEqual = (
  left: PostgresLogicalDatabaseOwner | undefined,
  right: PostgresLogicalDatabaseOwner,
) =>
  left?.logicalId === right.logicalId &&
  left.resourceType === right.resourceType &&
  left.version === right.version

const excludedAppRoleTableNames = (
  migrationsTable: string,
  importsTable: string,
  ownershipTable: string,
) => [migrationsTable, importsTable, ownershipTable]

const renameError = (oldName: string, newName: string) =>
  new Error(
    `Refusing to rename logical Postgres database "${oldName}" to "${newName}". ` +
      "Database renames can break downstream connection references; perform an explicit manual cutover instead.",
  )

const isReadablePostgresOrigin = (value: unknown): value is PostgresOrigin =>
  P.isObject(value) &&
  P.isString((value as Partial<Record<keyof PostgresOrigin, unknown>>).scheme) &&
  P.isString((value as Partial<Record<keyof PostgresOrigin, unknown>>).host) &&
  P.isNumber((value as Partial<Record<keyof PostgresOrigin, unknown>>).port) &&
  P.isString((value as Partial<Record<keyof PostgresOrigin, unknown>>).user) &&
  !P.isUndefined((value as Partial<Record<keyof PostgresOrigin, unknown>>).password)

const hasReadableLogicalDatabaseProps = (value: PostgresLogicalDatabaseProps | undefined) =>
  P.isObject(value) && isReadablePostgresOrigin(value.adminOrigin)

const appRolePrivilegesHash = (privileges: AppRolePrivilegeState | undefined) => privileges?.hash

const recordHashes = (files: readonly SqlFile[]) =>
  R.fromEntries(files.map((file) => [file.id, file.hash]))

const readLogicalDatabaseSqlFiles = (input: {
  readonly importFiles?: ReadonlyArray<string>
  readonly migrationsDir?: string
  readonly rootDir: string
}) =>
  Effect.gen(function* () {
    const migrations = yield* Arr.matchLeft(
      Option.toArray(optionalNonEmptyString(input.migrationsDir)),
      {
        onEmpty: () => Effect.succeed([] as readonly SqlFile[]),
        onNonEmpty: (directory) => listSqlFiles(directory),
      },
    )
    const imports = yield* Effect.forEach(
      Arr.sort(input.importFiles ?? [], Order.String),
      (filePath) => readSqlFile(input.rootDir, filePath),
      { concurrency: "unbounded" },
    )

    return {
      imports,
      migrations,
    }
  })

const logicalDatabaseNeedsUpdate = (input: {
  readonly appRoleName: string | undefined
  readonly appRolePrivileges: AppRolePrivilegeState | undefined
  readonly appRolePrivilegesVersion: number
  readonly imports: Record<string, string>
  readonly importsTable: string
  readonly migrations: Record<string, string>
  readonly migrationsTable: string
  readonly output: PostgresLogicalDatabaseAttributes
  readonly owner: PostgresLogicalDatabaseOwner
  readonly ownershipTable: string
}) =>
  input.output.appRoleName !== input.appRoleName ||
  input.output.appRolePrivilegesHash !== appRolePrivilegesHash(input.appRolePrivileges) ||
  input.output.appRolePrivilegesVersion !== input.appRolePrivilegesVersion ||
  input.output.migrationsTable !== input.migrationsTable ||
  input.output.importsTable !== input.importsTable ||
  input.output.ownershipTable !== input.ownershipTable ||
  !ownersEqual(input.output.owner, input.owner) ||
  input.appRolePrivileges?.ready === false ||
  !recordsEqual(input.migrations, input.output.migrationsHashes) ||
  !recordsEqual(input.imports, input.output.importHashes)

const readAppRolePrivilegesIfConfigured = (input: {
  readonly appRoleName: string | undefined
  readonly databaseName: string
  readonly excludedTableNames: readonly string[]
  readonly origin: PostgresOrigin
}) =>
  Arr.matchLeft(Option.toArray(optionalNonEmptyString(input.appRoleName)), {
    onEmpty: () => Effect.succeed(undefined),
    onNonEmpty: (roleName) =>
      readAppRolePrivileges({
        databaseName: input.databaseName,
        excludedTableNames: input.excludedTableNames,
        origin: input.origin,
        roleName,
      }),
  })

const logicalDatabaseUpdateAction = (needsUpdate: boolean) =>
  Match.value(needsUpdate).pipe(
    Match.when(true, updateAction),
    Match.when(false, () => undefined),
    Match.exhaustive,
  )

const diffExistingPresentDatabase = (input: {
  readonly appRoleName: string | undefined
  readonly appRolePrivilegesVersion: number
  readonly imports: Record<string, string>
  readonly importsTable: string
  readonly migrations: Record<string, string>
  readonly migrationsTable: string
  readonly output: PostgresLogicalDatabaseAttributes
  readonly owner: PostgresLogicalDatabaseOwner
  readonly ownershipTable: string
  readonly props: PostgresLogicalDatabaseProps
}) =>
  Effect.gen(function* () {
    const appRolePrivileges = yield* readAppRolePrivilegesIfConfigured({
      appRoleName: input.appRoleName,
      databaseName: input.output.name,
      excludedTableNames: excludedAppRoleTableNames(
        input.migrationsTable,
        input.importsTable,
        input.ownershipTable,
      ),
      origin: input.props.adminOrigin,
    })

    return logicalDatabaseUpdateAction(
      logicalDatabaseNeedsUpdate({
        appRoleName: input.appRoleName,
        appRolePrivileges,
        appRolePrivilegesVersion: input.appRolePrivilegesVersion,
        imports: input.imports,
        importsTable: input.importsTable,
        migrations: input.migrations,
        migrationsTable: input.migrationsTable,
        output: input.output,
        owner: input.owner,
        ownershipTable: input.ownershipTable,
      }),
    )
  })

const diffExistingDatabase = (input: {
  readonly appRoleName: string | undefined
  readonly appRolePrivilegesVersion: number
  readonly imports: Record<string, string>
  readonly importsTable: string
  readonly migrations: Record<string, string>
  readonly migrationsTable: string
  readonly output: PostgresLogicalDatabaseAttributes
  readonly owner: PostgresLogicalDatabaseOwner
  readonly ownershipTable: string
  readonly props: PostgresLogicalDatabaseProps
}) =>
  Effect.gen(function* () {
    const exists = yield* databaseExists(input.props.adminOrigin, input.output.name)
    const databaseExistsEffect = Effect.succeed(exists)
    const presentDiff = yield* diffExistingPresentDatabase(input).pipe(
      Effect.when(databaseExistsEffect),
    )
    return Option.getOrElse(presentDiff, updateAction)
  })

const readExistingDatabase = (input: {
  readonly id: string
  readonly name: string
  readonly olds: PostgresLogicalDatabaseProps
  readonly output: PostgresLogicalDatabaseAttributes | undefined
}) =>
  Effect.gen(function* () {
    const migrationsTable =
      input.olds.migrationsTable ?? input.output?.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE
    const importsTable =
      input.olds.importsTable ?? input.output?.importsTable ?? DEFAULT_IMPORTS_TABLE
    const ownershipTable = input.output?.ownershipTable ?? DEFAULT_OWNERSHIP_TABLE
    const owner = logicalDatabaseOwner(input.id)
    const databaseOwner = yield* readDatabaseOwnership({
      databaseName: input.name,
      origin: input.olds.adminOrigin,
      ownerResourceType: POSTGRES_LOGICAL_DATABASE_RESOURCE_TYPE,
      tableName: ownershipTable,
    })
    const [migrationsHashes, importHashes] = yield* Effect.all(
      [
        readTrackedSqlFileHashes({
          databaseName: input.name,
          origin: input.olds.adminOrigin,
          tableName: migrationsTable,
        }),
        readTrackedSqlFileHashes({
          databaseName: input.name,
          origin: input.olds.adminOrigin,
          tableName: importsTable,
        }),
      ],
      { concurrency: 2 },
    )
    const appRoleName = input.olds.appRoleName ?? input.output?.appRoleName
    const appRolePrivileges = yield* readAppRolePrivilegesIfConfigured({
      appRoleName,
      databaseName: input.name,
      excludedTableNames: excludedAppRoleTableNames(migrationsTable, importsTable, ownershipTable),
      origin: input.olds.adminOrigin,
    })
    const attributes = {
      appRoleName,
      appRolePrivilegesHash: appRolePrivilegesHash(appRolePrivileges),
      appRolePrivilegesVersion:
        input.olds.appRolePrivilegesVersion ??
        input.output?.appRolePrivilegesVersion ??
        DEFAULT_APP_ROLE_PRIVILEGES_VERSION,
      importHashes,
      importsTable,
      migrationsHashes,
      migrationsTable,
      name: input.name,
      owner,
      ownershipTable,
    } satisfies PostgresLogicalDatabaseAttributes

    return Match.value(ownersEqual(databaseOwner, owner)).pipe(
      Match.when(true, () => attributes),
      Match.when(false, () => Unowned(attributes)),
      Match.exhaustive,
    )
  })

const reconcileConfiguredAppRolePrivileges = (input: {
  readonly appRoleName: string
  readonly databaseName: string
  readonly migrationsTable: string
  readonly importsTable: string
  readonly ownershipTable: string
  readonly origin: PostgresOrigin
  readonly session: { readonly note: (message: string) => Effect.All.EffectAny }
}) =>
  Effect.gen(function* () {
    yield* input.session.note(
      `Ensuring app role privileges for logical Postgres database "${input.databaseName}"...`,
    )
    yield* ensureAppRolePrivileges({
      databaseName: input.databaseName,
      excludedTableNames: excludedAppRoleTableNames(
        input.migrationsTable,
        input.importsTable,
        input.ownershipTable,
      ),
      origin: input.origin,
      roleName: input.appRoleName,
    })
    return yield* readAppRolePrivileges({
      databaseName: input.databaseName,
      excludedTableNames: excludedAppRoleTableNames(
        input.migrationsTable,
        input.importsTable,
        input.ownershipTable,
      ),
      origin: input.origin,
      roleName: input.appRoleName,
    })
  })

const reconcileAppRolePrivileges = (input: {
  readonly appRoleName: string | undefined
  readonly databaseName: string
  readonly migrationsTable: string
  readonly importsTable: string
  readonly ownershipTable: string
  readonly origin: PostgresOrigin
  readonly session: { readonly note: (message: string) => Effect.All.EffectAny }
}) =>
  Arr.matchLeft(Option.toArray(optionalNonEmptyString(input.appRoleName)), {
    onEmpty: () => Effect.succeed(undefined),
    onNonEmpty: (appRoleName) => reconcileConfiguredAppRolePrivileges({ ...input, appRoleName }),
  })

const rejectDatabaseRename = (oldName: string, newName: string) =>
  Effect.succeed(newName).pipe(
    Effect.filterOrFail(
      (name) => name === oldName,
      (name) => renameError(oldName, name),
    ),
    Effect.asVoid,
  )

const rejectOutputRename = (output: PostgresLogicalDatabaseAttributes | undefined, name: string) =>
  Arr.matchLeft(Option.toArray(optionalString(output?.name)), {
    onEmpty: () => Effect.void,
    onNonEmpty: (oldName) => rejectDatabaseRename(oldName, name),
  })

const diffResolvedDatabase = (input: {
  readonly id: string
  readonly news: PostgresLogicalDatabaseProps
  readonly output: PostgresLogicalDatabaseAttributes
  readonly rootDir: string
}) =>
  Effect.gen(function* () {
    const name = yield* createLogicalDatabaseName(input.id, input.news.name)
    yield* rejectDatabaseRename(input.output.name, name)

    const appRolePrivilegesVersion =
      input.news.appRolePrivilegesVersion ?? DEFAULT_APP_ROLE_PRIVILEGES_VERSION
    const migrationsTable =
      input.news.migrationsTable ?? input.output.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE
    const importsTable =
      input.news.importsTable ?? input.output.importsTable ?? DEFAULT_IMPORTS_TABLE
    const ownershipTable = input.output.ownershipTable ?? DEFAULT_OWNERSHIP_TABLE
    const owner = logicalDatabaseOwner(input.id)
    const { imports, migrations } = yield* readLogicalDatabaseSqlFiles({
      importFiles: input.news.importFiles,
      migrationsDir: input.news.migrationsDir,
      rootDir: input.rootDir,
    })

    return yield* diffExistingDatabase({
      appRoleName: input.news.appRoleName,
      appRolePrivilegesVersion,
      imports: recordHashes(imports),
      importsTable,
      migrations: recordHashes(migrations),
      migrationsTable,
      output: input.output,
      owner,
      ownershipTable,
      props: input.news,
    })
  })

const readKnownDatabaseName = (input: {
  readonly id: string
  readonly olds: PostgresLogicalDatabaseProps
  readonly output: PostgresLogicalDatabaseAttributes | undefined
}) =>
  Arr.matchLeft(Option.toArray(optionalString(input.output?.name)), {
    onEmpty: () => createLogicalDatabaseName(input.id, input.olds.name),
    onNonEmpty: (name) => Effect.succeed(name),
  })

const readReadableDatabase = (input: {
  readonly id: string
  readonly olds: PostgresLogicalDatabaseProps
  readonly output: PostgresLogicalDatabaseAttributes | undefined
}) =>
  Effect.gen(function* () {
    const name = yield* readKnownDatabaseName(input)
    const exists = yield* databaseExists(input.olds.adminOrigin, name)
    const databaseExistsEffect = Effect.succeed(exists)
    const database = yield* readExistingDatabase({ ...input, name }).pipe(
      Effect.when(databaseExistsEffect),
    )
    return Option.getOrUndefined(database)
  })

export function PostgresLogicalDatabaseProvider() {
  const rootDir = process.cwd()

  return Provider.effect(
    PostgresLogicalDatabase,
    Effect.succeed({
      diff: Effect.fn(function* ({ id, news, output }) {
        return yield* Arr.matchLeft(
          Option.toArray(
            Option.product(Option.liftPredicate(news, isResolved), Option.fromUndefinedOr(output)),
          ),
          {
            onEmpty: () => Effect.succeed(undefined),
            onNonEmpty: ([resolvedNews, currentOutput]) =>
              diffResolvedDatabase({
                id,
                news: resolvedNews,
                output: currentOutput,
                rootDir,
              }),
          },
        )
      }),

      read: Effect.fn(function* ({ id, olds, output }) {
        return yield* Arr.matchLeft(
          Option.toArray(Option.liftPredicate(olds, hasReadableLogicalDatabaseProps)),
          {
            onEmpty: () => Effect.succeed(undefined),
            onNonEmpty: (readableOlds) =>
              readReadableDatabase({
                id,
                olds: readableOlds,
                output,
              }),
          },
        )
      }),

      reconcile: Effect.fn(function* ({ id, news, output, session }) {
        const name = yield* createLogicalDatabaseName(id, news.name)
        yield* rejectOutputRename(output, name)

        const appRolePrivilegesVersion =
          news.appRolePrivilegesVersion ?? DEFAULT_APP_ROLE_PRIVILEGES_VERSION
        const migrationsTable =
          news.migrationsTable ?? output?.migrationsTable ?? DEFAULT_MIGRATIONS_TABLE
        const importsTable = news.importsTable ?? output?.importsTable ?? DEFAULT_IMPORTS_TABLE
        const ownershipTable = output?.ownershipTable ?? DEFAULT_OWNERSHIP_TABLE
        const owner = logicalDatabaseOwner(id)
        const { imports, migrations } = yield* readLogicalDatabaseSqlFiles({
          importFiles: news.importFiles,
          migrationsDir: news.migrationsDir,
          rootDir,
        })

        yield* session.note(`Ensuring logical Postgres database "${name}"...`)
        yield* ensureDatabase(news.adminOrigin, name)

        yield* session.note(`Claiming logical Postgres database "${name}"...`)
        yield* ensureDatabaseOwnership({
          databaseName: name,
          origin: news.adminOrigin,
          owner,
          tableName: ownershipTable,
        })

        yield* session.note(`Applying migrations for logical Postgres database "${name}"...`)
        yield* applyTrackedSqlFiles({
          changedFileAction: "reject",
          databaseName: name,
          files: migrations,
          origin: news.adminOrigin,
          tableName: migrationsTable,
        })

        yield* session.note(`Applying imports for logical Postgres database "${name}"...`)
        yield* applyTrackedSqlFiles({
          changedFileAction: "reapply",
          databaseName: name,
          files: imports,
          origin: news.adminOrigin,
          tableName: importsTable,
        })

        const appRoleName = news.appRoleName
        const appRolePrivileges = yield* reconcileAppRolePrivileges({
          appRoleName,
          databaseName: name,
          importsTable,
          migrationsTable,
          origin: news.adminOrigin,
          ownershipTable,
          session,
        })

        return {
          appRoleName,
          appRolePrivilegesHash: appRolePrivilegesHash(appRolePrivileges),
          appRolePrivilegesVersion,
          importHashes: recordHashes(imports),
          importsTable,
          migrationsHashes: recordHashes(migrations),
          migrationsTable,
          name,
          owner,
          ownershipTable,
        } satisfies PostgresLogicalDatabaseAttributes
      }),

      delete: Effect.fn(function* ({ olds, output, session }) {
        yield* session.note(`Dropping logical Postgres database "${output.name}"...`)
        yield* dropDatabase(olds.adminOrigin, output.name)
      }),
    }),
  )
}
