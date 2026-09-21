export function localDateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDayStart(date: Date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}
