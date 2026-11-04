import * as Eq from "effect/Equal"

export const recordsEqual = (left: Record<string, string>, right: Record<string, string>) =>
  Eq.equals(left, right)
