import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..")

export const DB_STACK_NAME = "SharedPostgres"
export const APP_STACK_NAME = "ExampleViteApp"

export const postgresCluster = {
  name: "side-projects-postgres",
  clusterSize: "PS_20",
  defaultBranch: "main",
  regionSlug: "us-east",
} as const

export const projects = {
  project_a: {
    slug: "project_a",
    resourcePrefix: "ProjectA",
    workerName: "project-a-web",
    logicalDatabaseName: "project_a",
    migrationsDir: join(projectRoot, "migrations/project_a"),
  },
  project_b: {
    slug: "project_b",
    resourcePrefix: "ProjectB",
    workerName: "project-b-web",
    logicalDatabaseName: "project_b",
    migrationsDir: join(projectRoot, "migrations/project_b"),
  },
} as const

export type ProjectSlug = keyof typeof projects
export type ProjectConfig = (typeof projects)[ProjectSlug]

export function projectSlugs(): readonly ProjectSlug[] {
  return Object.keys(projects) as ProjectSlug[]
}

export function getProject(slug: string): ProjectConfig {
  if (slug in projects) {
    return projects[slug as ProjectSlug]
  }

  throw new Error(`Unknown APP_SLUG "${slug}". Expected one of: ${projectSlugs().join(", ")}.`)
}

export const appRoot = join(projectRoot, "app")
