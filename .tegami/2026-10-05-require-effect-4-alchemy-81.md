---
packages:
  alchemy-planetscale-logical-db: minor
---

## Require Effect 4.0 and Alchemy 81

This package now peers `effect` at `^4.0.0` and `alchemy` at
`>=2.0.0-beta.81`. The previous exact `effect@4.0.0-beta.107` pin is
replaced by the stable Effect 4 range. Alchemy `2.0.0-beta.81` is the
first Alchemy release that peers `effect` and the `@effect/*` packages
at `^4.0.0`. Older Alchemy betas were built against Effect 4 betas and
release candidates, including the rc.118 flattened module layout, so
this package does not claim they work on stable Effect.

Resource props, attributes, and the `TrackedSqlFileError` tag are
unchanged.

**Required action:** upgrade the consuming app to `effect@^4.0.0` (this
repository pins `4.0.1`) and `alchemy@2.0.0-beta.81` or later. If you
also use `@effect/*` packages, install the same `4.0.1` version.
