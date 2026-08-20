## alchemy-planetscale-logical-db@1.1.0

### Require Alchemy 72, Effect 107, and Node 24.15

This package now peers `alchemy` at `>=2.0.0-beta.72` and `effect` at exact
`4.0.0-beta.107`. Internal SQL-file tracking failures still use the
`TrackedSqlFileError` tag; they are constructed with Effect 107
`Schema.TaggedError` instead of `TaggedErrorClass`. Resource props and
attributes are unchanged. The published `engines.node` range is now
`>=24.15.0 <25`.

**Required action:** upgrade the consuming app to `alchemy@2.0.0-beta.72` or
later and `effect@4.0.0-beta.107`, and run Node `>=24.15.0 <25`.

# Changelog

## 1.0.0

<!-- release:start -->

### New Features

- Initial release of the Alchemy v2 `PostgresLogicalDatabase` resource for managing logical PostgreSQL databases inside PlanetScale Postgres clusters.
- Includes migration tracking, import tracking, app-role grant reconciliation, and the PlanetScale + PGLite + Hyperdrive example.

<!-- release:end -->
