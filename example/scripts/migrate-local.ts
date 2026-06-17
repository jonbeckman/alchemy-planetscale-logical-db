import { NodeRuntime, NodeServices } from "@effect/platform-node"
import postgres from "postgres"
import * as Arr from "effect/Array"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { getProject, type ProjectConfig } from "../src/config.ts"
import { requiredEnv } from "../src/env.ts"

type SqlClient = ReturnType<typeof postgres>

const sqlFiles = (entries: readonly string[]) =>
  Arr.sort(
    Arr.filter(entries, (file) => file.endsWith(".sql")),
    Order.String,
  )

const openSqlClient = (databaseUrl: string) =>
  Effect.try({
    try: () => postgres(databaseUrl, { max: 1 }),
    catch: (error) => error,
  })

const closeSqlClient = (sql: SqlClient) =>
  Effect.tryPromise({
    try: () => sql.end(),
    catch: (error) => error,
  }).pipe(Effect.ignore)

const applyMigration = (input: {
  readonly file: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly project: ProjectConfig
  readonly sql: SqlClient
}) =>
  Effect.gen(function* () {
    const migration = yield* input.fs.readFileString(
      input.path.join(input.project.migrationsDir, input.file),
    )
    yield* Effect.tryPromise({
      try: () => input.sql.unsafe(migration),
      catch: (error) => error,
    })
    yield* Console.log(`applied ${input.project.slug}/${input.file}`)
  })

const runMigrations = (input: {
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly project: ProjectConfig
  readonly sql: SqlClient
}) =>
  Effect.gen(function* () {
    const entries = yield* input.fs.readDirectory(input.project.migrationsDir)
    yield* Effect.forEach(sqlFiles(entries), (file) => applyMigration({ ...input, file }), {
      concurrency: 1,
      discard: true,
    })
  })

const MigrateLocalProgram = Effect.fn("MigrateLocalProgram")(function* () {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const project = getProject(requiredEnv("APP_SLUG"))
  const databaseUrl = requiredEnv("DATABASE_URL")
  const client = openSqlClient(databaseUrl)

  yield* Effect.acquireUseRelease(
    client,
    (sql) => runMigrations({ fs, path, project, sql }),
    closeSqlClient,
  )
})

NodeRuntime.runMain(MigrateLocalProgram().pipe(Effect.provide(NodeServices.layer)))
