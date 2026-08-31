import * as Match from "effect/Match"

const importFilePathError = (filePath: string) =>
  new Error(
    `Import file path "${filePath}" must be a normalized, repository-relative path using "/" separators (for example "seeds/users.sql"). Absolute paths, backslashes, empty segments, ".", and ".." are not stable tracked identifiers.`,
  )

const hasWindowsPathPrefix = (filePath: string) =>
  /^[a-zA-Z]:/.test(filePath) || filePath.startsWith("\\\\")

const hasEmptyOrParentSegment = (filePath: string) =>
  filePath.split("/").some((segment) => segment === "" || segment === "..")

const hasDotSegment = (filePath: string) => filePath.split("/").some((segment) => segment === ".")

const isUnstableImportPath = (filePath: string) =>
  filePath === "" ||
  filePath.startsWith("/") ||
  filePath.includes("\\") ||
  hasWindowsPathPrefix(filePath) ||
  hasEmptyOrParentSegment(filePath)

const dropDotSegments = (filePath: string) =>
  filePath.split("/").filter((segment) => segment !== ".").join("/")

/**
 * Stable import identity used to compare desired `importFiles` with existing
 * tracking rows. Leading and inner `.` segments are dropped so
 * `./seed/users.sql` and `seed/users.sql` are the same identity. Unstable
 * paths keep their original string and do not collapse onto a safe path.
 */
export const importFilePathIdentity = (filePath: string) =>
  Match.value(isUnstableImportPath(filePath) || dropDotSegments(filePath) === "").pipe(
    Match.when(true, () => filePath),
    Match.when(false, () => dropDotSegments(filePath)),
    Match.exhaustive,
  )

export const importFilePathsEqual = (left: string, right: string) =>
  importFilePathIdentity(left) === importFilePathIdentity(right)

export const validateImportFilePath = (filePath: string) =>
  Match.value(!isUnstableImportPath(filePath) && !hasDotSegment(filePath)).pipe(
    Match.when(true, () => filePath),
    Match.when(false, () => {
      throw importFilePathError(filePath)
    }),
    Match.exhaustive,
  )
