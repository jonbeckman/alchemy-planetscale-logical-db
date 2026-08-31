---
packages:
  alchemy-planetscale-logical-db: minor
---

## Repo-relative imports and underscore identifiers

This release lets consumers pin import files to a repository path, even when the
Alchemy process starts in another working directory. It also accepts Postgres
identifiers that start with an underscore, including the default tracking
tables.

`importFiles` values are now stable import identities. Use a normalized,
repository-relative path with `/` separators. Do not use empty, `.`, or `..`
segments. Absolute paths, backslashes, and Windows prefixes are rejected before
any database work.

A new tracked SQL file is written on first apply, including when the action is
`reject`. The resource still rejects a changed existing migration or import
when the action is `reject`. Unchanged existing files are not rewritten.

**Required action:** pass repository-relative `importFiles` such as
`seeds/users.sql`. Paths such as `./seed/users.sql` are no longer accepted. Set
`importRootDir` when deploys do not run from the repository root. That
filesystem root is not persisted.
