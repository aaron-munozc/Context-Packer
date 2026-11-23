/** A small, dependency-free glob matcher for the common gitignore-style syntax.
 * Supports *, **, ?, character classes and {a,b} alternatives.
 * Patterns without a slash match the same filename at any directory depth.
 */
function globSource(pattern: string): string {
  let source = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    const next = pattern[index + 1]

    if (character === '*' && next === '*') {
      if (pattern[index + 2] === '/') {
        source += '(?:.*/)?'
        index += 2
      } else {
        source += '.*'
        index += 1
      }
      continue
    }
    if (character === '*') {
      source += '[^/]*'
      continue
    }
    if (character === '?') {
      source += '[^/]'
      continue
    }
    if (character === '{') {
      const close = pattern.indexOf('}', index + 1)
      if (close > index) {
        const alternatives = pattern.slice(index + 1, close).split(',')
        source += `(?:${alternatives.map(globSource).join('|')})`
        index = close
        continue
      }
    }
    if (character === '[') {
      const close = pattern.indexOf(']', index + 1)
      if (close > index) {
        const body = pattern.slice(index + 1, close)
        source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`
        index = close
        continue
      }
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return source
}

export function matchesGlob(path: string, rawPattern: string): boolean {
  const normalizedPath = path.replace(/\\/g, '/').replace(/^\.\//, '')
  const normalizedPattern = rawPattern.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!normalizedPattern) return false

  const pattern = normalizedPattern.includes('/') ? normalizedPattern : `**/${normalizedPattern}`
  try {
    return new RegExp(`^${globSource(pattern)}$`, 'i').test(normalizedPath)
  } catch {
    return false
  }
}

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
