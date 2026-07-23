import { describe, it, expect } from 'vitest'
import { offlineCategorize, NoCategoryDecisionError } from '../src/lib/offlineCategorizer'
import { CategoryNotFoundError } from '../src/lib/categorizer'

const DEFAULT_NAMES = ['Work', 'Personal', 'School', 'Entertainment']

describe('offlineCategorize', () => {
  it('categorizes a known site with default categories at high confidence', () => {
    const result = offlineCategorize('https://github.com/foo/bar', 'foo/bar', DEFAULT_NAMES)
    expect(result).toEqual({ category: 'Work', confidence: 'high' })
  })

  it('resolves a known site to a renamed category via synonyms', () => {
    const result = offlineCategorize('https://github.com/foo/bar', 'foo/bar', ['Coding', 'Life', 'Uni', 'Fun'])
    expect(result.category).toBe('Coding')
    expect(result.confidence).toBe('high')
  })

  it('matches synonyms on word boundaries, not substrings', () => {
    // "Community" contains "uni" as a substring but is not a School synonym word
    const result = offlineCategorize('https://someuniversity.edu/courses/cs101', 'CS101', ['Community', 'Studies'])
    expect(result.category).toBe('Studies')
  })

  it('categorizes an unknown .edu domain with course path as School', () => {
    const result = offlineCategorize('https://someuniversity.edu/courses/cs101', 'CS101', DEFAULT_NAMES)
    expect(result).toEqual({ category: 'School', confidence: 'high' })
  })

  it('falls through ranked canonicals until one resolves', () => {
    // Entertainment scores highest but resolves to nothing; Work resolves to Engineering
    const result = offlineCategorize('https://play.example.com/docs', 'Episode 5', ['Engineering', 'Chores'])
    expect(result.category).toBe('Engineering')
  })

  it('throws NoCategoryDecisionError when there are no signals', () => {
    expect(() => offlineCategorize('https://zqxjk.com/', 'hello', DEFAULT_NAMES))
      .toThrow(NoCategoryDecisionError)
  })

  it('throws NoCategoryDecisionError for an invalid URL', () => {
    expect(() => offlineCategorize('not-a-url', '', DEFAULT_NAMES))
      .toThrow(NoCategoryDecisionError)
  })

  it('throws CategoryNotFoundError when no canonical resolves to any user category', () => {
    expect(() => offlineCategorize('https://docs.example.com/api', 'Getting Started', ['Zzz']))
      .toThrow(CategoryNotFoundError)
  })
})
