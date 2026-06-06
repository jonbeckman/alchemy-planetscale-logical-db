import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import postgres from "postgres"
import { getProject } from "../src/config.ts"
import { requiredEnv } from "../src/env.ts"

const project = getProject(requiredEnv("APP_SLUG"))
const databaseUrl = requiredEnv("DATABASE_URL")
const sql = postgres(databaseUrl, { max: 1 })

try {
  const files = (await readdir(project.migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right))

  for (const file of files) {
    const migration = await readFile(join(project.migrationsDir, file), "utf8")
    await sql.unsafe(migration)
    console.log(`applied ${project.slug}/${file}`)
  }
} finally {
  await sql.end()
}
