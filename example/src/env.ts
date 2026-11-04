import * as Config from "effect/Config"
import * as Schema from "effect/Schema"

export const appSlugConfig = Config.NonEmptyString("APP_SLUG")

export const databaseUrlConfig = Config.schema(
  Schema.Redacted(Schema.NonEmptyString),
  "DATABASE_URL",
)
