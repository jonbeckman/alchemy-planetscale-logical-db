import * as Equal from "effect/Equal"

export const recordsEqual = (left: Record<string, string>, right: Record<string, string>) =>
  Equal.equals(left, right)
