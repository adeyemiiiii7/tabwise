import { describe, it, expect } from 'vitest'
import { matchCategory, findCategoryName, CategoryNotFoundError } from '../src/lib/categorizer'
import { Category } from '../src/types'

const CATEGORIES: Category[] = [
  { id: 'work', name: 'Work', color: '#4A90D9' },
  { id: 'personal', name: 'Personal', color: '#7ED321' },
]

describe('matchCategory', () => {
  it('matches exactly, case-insensitively', () => {
    expect(matchCategory('work', CATEGORIES).name).toBe('Work')
    expect(matchCategory('  WORK ', CATEGORIES).name).toBe('Work')
  })

  it('matches when the reply contains the category name', () => {
    expect(matchCategory('This is clearly Work', CATEGORIES).name).toBe('Work')
  })

  it('throws CategoryNotFoundError for an unmatchable reply', () => {
    expect(() => matchCategory('Gibberish', CATEGORIES)).toThrow(CategoryNotFoundError)
  })
})

describe('findCategoryName', () => {
  it('prefers the exact match over a partial one', () => {
    expect(findCategoryName('personal', ['Personal', 'Personal Finance'])).toBe('Personal')
  })

  it('throws CategoryNotFoundError when nothing matches', () => {
    expect(() => findCategoryName('nothing', ['Work'])).toThrow(CategoryNotFoundError)
  })
})
