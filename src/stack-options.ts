import * as Alchemy from "alchemy"
import * as Cloudflare from "alchemy/Cloudflare"
import * as Planetscale from "alchemy/Planetscale"
import * as Layer from "effect/Layer"

export function stackOptions(): any {
  return {
    providers: Layer.mergeAll(Cloudflare.providers(), Planetscale.providers()),
    state: Alchemy.localState(),
  }
}
