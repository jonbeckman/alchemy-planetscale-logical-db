import * as Alchemy from "alchemy"
import * as Output from "alchemy/Output"
import * as Planetscale from "alchemy/Planetscale"
import * as PlanetscaleLogicalDb from "alchemy-planetscale-logical-db"
import * as Effect from "effect/Effect"
import { DB_STACK_NAME, postgresCluster, projects, type ProjectConfig } from "./src/config.ts"
import { stackOptions } from "./src/stack-options.ts"

export interface SharedPostgresOutput {
  readonly clusterName: string
  readonly logicalDatabases: readonly string[]
}

export class SharedPostgres extends Alchemy.Stack<SharedPostgres, SharedPostgresOutput>()(
  DB_STACK_NAME,
) {}

function createProjectDatabase(project: ProjectConfig, cluster: Planetscale.PostgresDatabase) {
  return Effect.gen(function* () {
    const adminRole = yield* Planetscale.PostgresRole(
      `${project.resourcePrefix}PostgresAdminRole`,
      {
        branch: postgresCluster.defaultBranch,
        database: cluster,
        inheritedRoles: ["postgres"],
        successor: "postgres",
      },
    )

    const appRole = yield* Planetscale.PostgresRole(`${project.resourcePrefix}PostgresAppRole`, {
      branch: postgresCluster.defaultBranch,
      database: cluster,
      inheritedRoles: [],
      successor: "postgres",
    })

    return yield* PlanetscaleLogicalDb.PostgresLogicalDatabase(
      `${project.resourcePrefix}PostgresDatabase`,
      {
        adminOrigin: adminRole.origin,
        appRoleName: Output.map(
          appRole.username,
          PlanetscaleLogicalDb.postgresRoleNameFromUsername,
        ),
        appRolePrivilegesVersion: 1,
        importsTable: "__app_imports",
        migrationsDir: project.migrationsDir,
        migrationsTable: "__app_migrations",
        name: project.logicalDatabaseName,
      },
    )
  })
}

const SharedPostgresProgram = Effect.gen(function* () {
  const cluster = yield* Planetscale.PostgresDatabase("SharedPostgresCluster", {
    clusterSize: postgresCluster.clusterSize,
    defaultBranch: postgresCluster.defaultBranch,
    name: postgresCluster.name,
    region: { slug: postgresCluster.regionSlug },
  })

  yield* Effect.all(
    Object.values(projects).map((project) => createProjectDatabase(project, cluster)),
    { concurrency: "unbounded" },
  )

  return {
    clusterName: postgresCluster.name,
    logicalDatabases: Object.values(projects).map((project) => project.logicalDatabaseName),
  } satisfies SharedPostgresOutput
})

export default SharedPostgres.make(stackOptions(), SharedPostgresProgram)
