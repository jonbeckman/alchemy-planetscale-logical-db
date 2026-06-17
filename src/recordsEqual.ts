export const recordsEqual = (left: Record<string, string>, right: Record<string, string>) => {
  const leftEntries = Object.entries(left).sort(([a], [b]) => a.localeCompare(b))
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b))

  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries)
}
