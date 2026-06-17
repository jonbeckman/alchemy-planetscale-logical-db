import crypto from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as Effect from "effect/Effect";

export interface SqlFile {
  readonly id: string;
  readonly sql: string;
  readonly hash: string;
}

const sqlFilePrefix = (name: string): number | null => {
  const prefix = name.split("_")[0];
  const parsed = Number.parseInt(prefix, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

const compareSqlFiles = (left: string, right: string) => {
  const leftPrefix = sqlFilePrefix(left);
  const rightPrefix = sqlFilePrefix(right);

  if (leftPrefix !== null && rightPrefix !== null) {
    return leftPrefix - rightPrefix;
  }

  if (leftPrefix !== null) return -1;
  if (rightPrefix !== null) return 1;

  return left.localeCompare(right);
};

export const readSqlFile = (directory: string, name: string) =>
  Effect.tryPromise(async () => {
    const sql = await readFile(resolve(directory, name), "utf8");
    const hash = crypto.createHash("sha256").update(sql).digest("hex");
    const file: SqlFile = { id: name, sql, hash };
    Object.defineProperty(file, "sql", { enumerable: false });
    return file;
  });

export const listSqlFiles = (directory: string) =>
  Effect.gen(function* () {
    const entries = yield* Effect.tryPromise(() =>
      readdir(directory, { recursive: true }),
    );
    const sqlFileNames = entries
      .map((entry) => String(entry))
      .filter((name) => name.endsWith(".sql"))
      .sort(compareSqlFiles);

    return yield* Effect.all(
      sqlFileNames.map((name) => readSqlFile(directory, name)),
    );
  });
