const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/** Format a number as Brazilian currency, e.g. 157.5 -> "R$ 157,50". */
export function money(value: number): string {
  return brl.format(value || 0)
}
