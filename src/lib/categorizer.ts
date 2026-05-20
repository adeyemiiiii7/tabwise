import { Category } from '../types'

export class CategoryNotFoundError extends Error {
  constructor(reply: string) {
    super(`No category matches reply: "${reply}"`)
    this.name = 'CategoryNotFoundError'
  }
}

export function matchCategory(reply: string, categories: Category[]): Category {
  const lower = reply.toLowerCase().trim()
  const exact = categories.find(c => c.name.toLowerCase() === lower)
  if (exact) return exact
  const partial = categories.find(c => lower.includes(c.name.toLowerCase()))
  if (partial) return partial
  throw new CategoryNotFoundError(reply)
}

export function findCategoryName(reply: string, categoryNames: string[]): string {
  const lower = reply.toLowerCase().trim()
  const exact = categoryNames.find(n => n.toLowerCase() === lower)
  if (exact) return exact
  const partial = categoryNames.find(n => lower.includes(n.toLowerCase()))
  if (partial) return partial
  throw new CategoryNotFoundError(reply)
}
