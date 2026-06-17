import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"

export interface SqlFile {
  readonly id: string
  readonly sql: string
  readonly hash: string
}

const textEncoder = new TextEncoder()

const bytesToHex = (bytes: ArrayBuffer) =>
  Arr.fromIterable(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")

const sha256Hex = (value: string) =>
  Effect.tryPromise({
    try: () => globalThis.crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
    catch: (error) => error,
  }).pipe(Effect.map(bytesToHex))

function sqlFilePrefix(name: string) {
  const prefix = name.split("_")[0]
  const parsed = Number.parseInt(prefix, 10)
  return Option.liftPredicate(parsed, (value) => !Number.isNaN(value))
}

const compareSqlFiles: Order.Order<string> = (left, right) =>
  Option.product(sqlFilePrefix(left), sqlFilePrefix(right)).pipe(
    Option.match({
      onSome: ([leftPrefix, rightPrefix]) => Order.Number(leftPrefix, rightPrefix),
      onNone: () =>
        sqlFilePrefix(left).pipe(
          Option.match({
            onSome: () => -1,
            onNone: () =>
              sqlFilePrefix(right).pipe(
                Option.match({
                  onSome: () => 1,
                  onNone: () => Order.String(left, right),
                }),
              ),
          }),
        ),
    }),
  )

export const readSqlFile = (directory: string, name: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const sql = yield* fs.stream(path.join(directory, name)).pipe(
      Stream.decodeText(),
      Stream.runFold(
        () => "",
        (content: string, chunk: string) => content + chunk,
      ),
    )
    const hash = yield* sha256Hex(sql)
    const file: SqlFile = { id: name, sql, hash }
    Object.defineProperty(file, "sql", { enumerable: false })
    return file
  })

export const listSqlFiles = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const entries = yield* fs.readDirectory(directory, { recursive: true })
    const sqlFileNames = Arr.sort(
      entries.map((entry) => String(entry)).filter((name) => name.endsWith(".sql")),
      compareSqlFiles,
    )

    return yield* Effect.forEach(sqlFileNames, (name) => readSqlFile(directory, name), {
      concurrency: "unbounded",
    })
  })
