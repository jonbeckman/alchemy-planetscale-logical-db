import * as Option from "effect/Option"
import * as R from "effect/Record"

const projectPath = (path: string) => new URL(path, import.meta.url).pathname

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
    migrationsDir: projectPath("../migrations/project_a"),
  },
  project_b: {
    slug: "project_b",
    resourcePrefix: "ProjectB",
    workerName: "project-b-web",
    logicalDatabaseName: "project_b",
    migrationsDir: projectPath("../migrations/project_b"),
  },
} as const

export type ProjectSlug = keyof typeof projects
export type ProjectConfig = (typeof projects)[ProjectSlug]

export function projectSlugs(): readonly ProjectSlug[] {
  return R.keys(projects) as ProjectSlug[]
}

function unknownProjectSlug(slug: string): never {
  throw new Error(`Unknown APP_SLUG "${slug}". Expected one of: ${projectSlugs().join(", ")}.`)
}

export const getProject = (slug: string): ProjectConfig =>
  R.get(projects, slug as ProjectSlug).pipe(
    Option.match({
      onSome: (project) => project,
      onNone: () => unknownProjectSlug(slug),
    }),
  )

export const appRoot = projectPath("../app")
