import { NodeRuntime, NodeServices } from "@effect/platform-node"
import * as Arr from "effect/Array"
import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { Client } from "pg"
import { getProject, type ProjectConfig } from "../src/config.ts"
import { requiredEnv } from "../src/env.ts"

const sqlFiles = (entries: readonly string[]) =>
  Arr.sort(
    Arr.filter(entries, (file) => file.endsWith(".sql")),
    Order.String,
  )

const connectSqlClient = (client: Client) =>
  Effect.tryPromise({
    try: () => client.connect(),
    catch: (error) => error,
  }).pipe(Effect.map(() => client))

const openSqlClient = (databaseUrl: string) =>
  connectSqlClient(new Client({ connectionString: databaseUrl, ssl: false }))

const closeSqlClient = (client: Client) =>
  Effect.tryPromise({
    try: () => client.end(),
    catch: (error) => error,
  }).pipe(Effect.ignore)

const applyMigration = (input: {
  readonly file: string
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly project: ProjectConfig
  readonly sql: Client
}) =>
  Effect.gen(function* () {
    const migration = yield* input.fs.readFileString(
      input.path.join(input.project.migrationsDir, input.file),
    )
    yield* Effect.tryPromise({
      try: () => input.sql.query(migration),
      catch: (error) => error,
    })
    yield* Console.log(`applied ${input.project.slug}/${input.file}`)
  })

const runMigrations = (input: {
  readonly fs: FileSystem.FileSystem
  readonly path: Path.Path
  readonly project: ProjectConfig
  readonly sql: Client
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
