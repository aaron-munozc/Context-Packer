/**
 * Lightweight path/glob helpers shared by search previews and selection rules.
 *
 * Supported syntax mirrors the subset accepted by the Rust `globset` backend:
 * `*`, `**`, `?`, character classes (`[abc]`, `[!abc]`) and brace alternatives
 * (`{js,ts}`). A name-only pattern is matched at any directory depth.
 */
export type GlobValidation =
  | { valid: true; pattern: string }
  | { valid: false; error: string }

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
      const alternatives = pattern.slice(index + 1, close).split(',')
      source += `(?:${alternatives.map(globSource).join('|')})`
      index = close
      continue
    }
    if (character === '[') {
      const close = pattern.indexOf(']', index + 1)
      const body = pattern.slice(index + 1, close)
      source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`
      index = close
      continue
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return source
}

/** Validate once before saving/applying so invalid rules never poison a scan. */
export function validateGlob(rawPattern: string): GlobValidation {
  const pattern = rawPattern.trim().replace(/\\/g, '/').replace(/^\.\//, '')
  if (!pattern) return { valid: false, error: 'Enter a glob pattern first.' }
  if (pattern.startsWith('!')) return { valid: false, error: 'Negated patterns are not supported. Use a positive pattern instead.' }
  if (pattern.startsWith('/') || /^[a-zA-Z]:\//.test(pattern)) return { valid: false, error: 'Patterns must be relative to the selected project folder.' }
  if (pattern.includes('\0')) return { valid: false, error: 'The pattern contains an invalid null character.' }
  const segments = pattern.split('/')
  if (segments.some((segment) => segment === '..')) {
    return { valid: false, error: 'Parent-directory segments (..) are not allowed in patterns.' }
  }
  if (segments.some((segment) => segment.includes('**') && segment !== '**')) {
    return { valid: false, error: 'Use ** as a complete path segment, for example **/*.ts or src/**/test.ts.' }
  }

  // Check balanced, non-nested brace alternatives and character classes.
  // Delimiters inside a character class are treated as literal class members.
  let braceOpen = -1
  let bracketOpen = -1
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]

    if (bracketOpen !== -1) {
      if (character === ']') {
        if (index === bracketOpen + 1 || (index === bracketOpen + 2 && pattern[bracketOpen + 1] === '!')) {
          return { valid: false, error: 'Character classes cannot be empty.' }
        }
        bracketOpen = -1
      }
      continue
    }

    if (braceOpen !== -1) {
      if (character === '{') return { valid: false, error: 'Nested brace alternatives are not supported.' }
      if (character === '}') {
        const alternatives = pattern.slice(braceOpen + 1, index).split(',')
        if (alternatives.length < 2 || alternatives.some((item) => !item.trim())) {
          return { valid: false, error: 'Brace alternatives need at least two non-empty values, like {js,ts}.' }
        }
        braceOpen = -1
      }
      continue
    }

    if (character === '{') braceOpen = index
    else if (character === '}') return { valid: false, error: 'There is a closing brace without a matching opening brace.' }
    else if (character === '[') bracketOpen = index
    else if (character === ']') return { valid: false, error: 'There is a closing bracket without a matching opening bracket.' }
  }
  if (braceOpen !== -1) return { valid: false, error: 'There is an opening brace without a matching closing brace.' }
  if (bracketOpen !== -1) return { valid: false, error: 'There is an opening bracket without a matching closing bracket.' }

  const matchPattern = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
  const normalized = matchPattern.includes('/') ? matchPattern : `**/${matchPattern}`
  try {
    new RegExp(`^${globSource(normalized)}$`, 'i')
  } catch {
    return { valid: false, error: 'The pattern contains an invalid character class or wildcard expression.' }
  }
  return { valid: true, pattern }
}

function compilePattern(pattern: string): RegExp | null {
  const cleaned = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern
  const normalized = cleaned.includes('/') ? cleaned : `**/${cleaned}`
  try {
    return new RegExp(`^${globSource(normalized)}$`, 'i')
  } catch {
    return null
  }
}

export function matchesGlob(path: string, rawPattern: string): boolean {
  const validation = validateGlob(rawPattern)
  if (!validation.valid) return false
  const normalizedPath = path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
  const matcher = compilePattern(validation.pattern)
  if (!matcher) return false
  if (matcher.test(normalizedPath)) return true

  // A trailing slash explicitly denotes a directory pattern. Test each path
  // prefix so `vendor/` and `src/generated/` also match files below that folder.
  if (validation.pattern.endsWith('/')) {
    const parts = normalizedPath.split('/').filter(Boolean)
    for (let length = 1; length < parts.length; length += 1) {
      if (matcher.test(parts.slice(0, length).join('/'))) return true
    }
  }
  return false
}

export function fuzzyMatch(value: string, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) return true

  const haystack = value.toLowerCase()
  if (haystack.includes(needle)) return true

  let cursor = 0
  for (const char of needle) {
    cursor = haystack.indexOf(char, cursor)
    if (cursor === -1) return false
    cursor += 1
  }
  return true
}
