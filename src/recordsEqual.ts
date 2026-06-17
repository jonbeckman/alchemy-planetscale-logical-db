import * as Arr from "effect/Array"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as R from "effect/Record"

const entryOrder = Order.make<readonly [string, string]>(([leftKey], [rightKey]) =>
  Order.String(leftKey, rightKey),
)

const sortedEntries = (record: Record<string, string>) => Arr.sort(R.toEntries(record), entryOrder)

const entriesEqual = (left: readonly [string, string], right: readonly [string, string]) =>
  left[0] === right[0] && left[1] === right[1]

export const recordsEqual = (left: Record<string, string>, right: Record<string, string>) =>
  leftEntriesEqual(sortedEntries(left), sortedEntries(right))

const leftEntriesEqual = (
  leftEntries: readonly (readonly [string, string])[],
  rightEntries: readonly (readonly [string, string])[],
) =>
  leftEntries.length === rightEntries.length &&
  leftEntries.every((entry, index) =>
    Option.fromUndefinedOr(rightEntries[index]).pipe(
      Option.exists((rightEntry) => entriesEqual(entry, rightEntry)),
    ),
  )
