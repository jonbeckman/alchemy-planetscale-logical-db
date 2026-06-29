import * as Alchemy from "alchemy"
import type * as Cloudflare from "alchemy/Cloudflare"
import * as Website from "alchemy/Cloudflare/Website"
import * as Effect from "effect/Effect"
import { APP_STACK_NAME, appRoot, getProject } from "./src/config.ts"
import { appDbModeFromEnv, requiredEnv, type AppDbMode } from "./src/env.ts"
import { createProjectHyperdrive } from "./src/hyperdrive.ts"
import { stackOptions } from "./src/stack-options.ts"

export interface ExampleViteAppOutput {
  readonly appDbMode: AppDbMode
  readonly project: string
  readonly workerName: string
}

export class ExampleViteApp extends Alchemy.Stack<ExampleViteApp, ExampleViteAppOutput>()(
  APP_STACK_NAME,
) {}

const ExampleViteAppProgram = Effect.fn("ExampleViteAppProgram")(function* (): Effect.fn.Return<
  ExampleViteAppOutput,
  never,
  Alchemy.AlchemyContext | Cloudflare.Providers
> {
  const appDbMode = appDbModeFromEnv()
  const project = getProject(requiredEnv("APP_SLUG"))
  const db = yield* createProjectHyperdrive(project, appDbMode)

  yield* Website.Vite(`${project.resourcePrefix}Web`, {
    compatibility: {
      date: "2026-05-24",
      flags: ["nodejs_compat"],
    },
    env: {
      APP_DB_MODE: appDbMode,
      DB: db,
    },
    memo: {
      include: ["app/**", "src/**", "package.json", "vite.config.ts"],
    },
    name: project.workerName,
    rootDir: appRoot,
    url: true,
  })

  return {
    appDbMode,
    project: project.slug,
    workerName: project.workerName,
  } satisfies ExampleViteAppOutput
})

export default ExampleViteApp.make(stackOptions(), ExampleViteAppProgram())
