import { Category } from '../types'

export function matchCategory(reply: string, categories: Category[]): Category {
  const lower = reply.toLowerCase().trim()
  return (
    categories.find(c => c.name.toLowerCase() === lower) ??
    categories.find(c => lower.includes(c.name.toLowerCase())) ??
    categories[0]
  )
}
