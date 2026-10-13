export function fuzzyMatch(value: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  const haystack = value.toLowerCase()
  if (haystack.includes(needle)) return true

  let cursor = 0
  for (const char of needle) {
    const found = haystack.indexOf(char, cursor)
    if (found === -1) return false
    cursor = found + 1
  }
  return true
}
