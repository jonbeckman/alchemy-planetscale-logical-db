import * as Provider from "alchemy/Provider"
import type { StackServices } from "alchemy/Stack"
import * as Layer from "effect/Layer"
import {
  PostgresLogicalDatabase,
  PostgresLogicalDatabaseProvider,
} from "./PostgresLogicalDatabase.ts"

/**
 * Service tag for this package's Alchemy providers.
 */
export class Providers extends Provider.ProviderCollection<Providers>()(
  "PlanetscaleLogicalDatabase",
) {}

export type ProviderRequirements = Layer.Services<ReturnType<typeof providers>>

export const providers = (): Layer.Layer<Providers, never, StackServices> =>
  Layer.effect(Providers, Provider.collection([PostgresLogicalDatabase])).pipe(
    Layer.provide(PostgresLogicalDatabaseProvider()),
  )
