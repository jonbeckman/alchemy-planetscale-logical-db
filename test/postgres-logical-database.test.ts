import assert from "node:assert/strict"
import { describe, it } from "node:test"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Stream from "effect/Stream"
import {
  readLogicalDatabaseSqlFiles,
  validateImportFilePath,
} from "../src/PostgresLogicalDatabase.ts"
import {
  trackedSqlFileApplyDecision,
  validateIdentifier,
} from "../src/PostgresLogicalDatabaseClient.ts"

const textEncoder = new TextEncoder()

const mockSqlForPath = (filePath: string) =>
  Match.value(filePath).pipe(
    Match.when("/repo/seeds/users.sql", () => "INSERT INTO users VALUES (1);"),
    Match.when("/cwd/seeds/users.sql", () => "INSERT INTO users VALUES (99);"),
    Match.orElse(() => ""),
  )

const sqlFileTestLayer = Layer.mergeAll(
  Path.layer,
  FileSystem.layerNoop({
    stream: (filePath) => Stream.make(textEncoder.encode(mockSqlForPath(filePath))),
  }),
)

describe("validateIdentifier", () => {
  it("accepts identifiers that start with a lowercase letter", () => {
    assert.doesNotThrow(() => validateIdentifier("Postgres identifier", "app"))
    assert.doesNotThrow(() => validateIdentifier("Postgres identifier", "app_db_1"))
  })

  it("accepts identifiers that start with an underscore", () => {
    assert.doesNotThrow(() => validateIdentifier("Postgres identifier", "_app"))
    assert.doesNotThrow(() => validateIdentifier("Postgres identifier", "__alchemy_migrations"))
    assert.doesNotThrow(() => validateIdentifier("Postgres identifier", "__alchemy_imports"))
    assert.doesNotThrow(() =>
      validateIdentifier("Postgres identifier", "__alchemy_logical_database_ownership"),
    )
  })

  it("rejects identifiers that do not start with a lowercase letter or underscore", () => {
    assert.throws(
      () => validateIdentifier("Postgres identifier", "App"),
      /must start with a lowercase letter or underscore and contain only lowercase letters, numbers, and underscores/,
    )
    assert.throws(() => validateIdentifier("Postgres identifier", "1app"))
    assert.throws(() => validateIdentifier("Postgres identifier", "app-name"))
    assert.throws(() => validateIdentifier("Postgres identifier", ""))
  })
})

describe("validateImportFilePath", () => {
  it("accepts normalized repository-relative paths", () => {
    assert.equal(validateImportFilePath("seeds/users.sql"), "seeds/users.sql")
    assert.equal(validateImportFilePath("a.sql"), "a.sql")
    assert.equal(validateImportFilePath("_private/seed.sql"), "_private/seed.sql")
    assert.equal(validateImportFilePath("nested/deep/file.sql"), "nested/deep/file.sql")
  })

  it("rejects empty, absolute, dotted, parent, and Windows paths", () => {
    const rejected = [
      "",
      "./seed/users.sql",
      "../secrets.sql",
      "/abs/path.sql",
      "seeds\\users.sql",
      "C:/seeds/users.sql",
      "C:seeds/users.sql",
      "\\\\server\\share\\seed.sql",
      "seeds//users.sql",
      "seeds/./users.sql",
      "seeds/../users.sql",
      "seeds/users.sql/",
    ]

    for (const filePath of rejected) {
      assert.throws(
        () => validateImportFilePath(filePath),
        /normalized, repository-relative path/,
        filePath,
      )
    }
  })
})

describe("readLogicalDatabaseSqlFiles importRootDir", () => {
  it("resolves import files from importRootDir when set", async () => {
    const result = await Effect.runPromise(
      readLogicalDatabaseSqlFiles({
        importFiles: ["seeds/users.sql"],
        importRootDir: "/repo",
        rootDir: "/cwd",
      }).pipe(Effect.provide(sqlFileTestLayer)),
    )

    assert.equal(result.imports.length, 1)
    assert.equal(result.imports[0]?.id, "seeds/users.sql")
    assert.equal(result.imports[0]?.sql, "INSERT INTO users VALUES (1);")
  })

  it("resolves import files from rootDir when importRootDir is omitted", async () => {
    const result = await Effect.runPromise(
      readLogicalDatabaseSqlFiles({
        importFiles: ["seeds/users.sql"],
        rootDir: "/cwd",
      }).pipe(Effect.provide(sqlFileTestLayer)),
    )

    assert.equal(result.imports.length, 1)
    assert.equal(result.imports[0]?.id, "seeds/users.sql")
    assert.equal(result.imports[0]?.sql, "INSERT INTO users VALUES (99);")
  })

  it("rejects invalid import paths before reading files", () => {
    assert.throws(
      () =>
        Effect.runSync(
          readLogicalDatabaseSqlFiles({
            importFiles: ["./seed/users.sql"],
            rootDir: "/cwd",
          }).pipe(Effect.provide(sqlFileTestLayer)),
        ),
      /normalized, repository-relative path/,
    )
  })
})

describe("trackedSqlFileApplyDecision", () => {
  const none = Option.none<string>()
  const existing = Option.some("abc")

  it("writes a new file even when the action is reject", () => {
    assert.deepEqual(
      trackedSqlFileApplyDecision({
        changedFileAction: "reject",
        existingHash: none,
        fileHash: "new",
      }),
      {
        hasChangedExistingFile: false,
        rejectsChangedFile: false,
        shouldWrite: true,
      },
    )
  })

  it("writes a new file when the action is reapply", () => {
    assert.deepEqual(
      trackedSqlFileApplyDecision({
        changedFileAction: "reapply",
        existingHash: none,
        fileHash: "new",
      }),
      {
        hasChangedExistingFile: false,
        rejectsChangedFile: false,
        shouldWrite: true,
      },
    )
  })

  it("does not rewrite an unchanged existing file", () => {
    assert.deepEqual(
      trackedSqlFileApplyDecision({
        changedFileAction: "reject",
        existingHash: existing,
        fileHash: "abc",
      }),
      {
        hasChangedExistingFile: false,
        rejectsChangedFile: false,
        shouldWrite: false,
      },
    )
    assert.deepEqual(
      trackedSqlFileApplyDecision({
        changedFileAction: "reapply",
        existingHash: existing,
        fileHash: "abc",
      }),
      {
        hasChangedExistingFile: false,
        rejectsChangedFile: false,
        shouldWrite: false,
      },
    )
  })

  it("rejects a changed existing file when the action is reject", () => {
    assert.deepEqual(
      trackedSqlFileApplyDecision({
        changedFileAction: "reject",
        existingHash: existing,
        fileHash: "changed",
      }),
      {
        hasChangedExistingFile: true,
        rejectsChangedFile: true,
        shouldWrite: true,
      },
    )
  })

  it("writes a changed existing file when the action is reapply", () => {
    assert.deepEqual(
      trackedSqlFileApplyDecision({
        changedFileAction: "reapply",
        existingHash: existing,
        fileHash: "changed",
      }),
      {
        hasChangedExistingFile: true,
        rejectsChangedFile: false,
        shouldWrite: true,
      },
    )
  })
})
