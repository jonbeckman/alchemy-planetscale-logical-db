import * as Alchemy from "alchemy"
import * as Planetscale from "alchemy/Planetscale"
import * as PlanetscaleLogicalDb from "alchemy-planetscale-logical-db"
import * as Layer from "effect/Layer"

export function stackOptions() {
  return {
    providers: Layer.mergeAll(Planetscale.providers(), PlanetscaleLogicalDb.providers()),
    state: Alchemy.localState(),
  }
}
