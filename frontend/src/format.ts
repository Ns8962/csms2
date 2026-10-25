import type { Decimal } from './types.ts'

export const decimalText = (value: Decimal): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return value.$numberDecimal ?? ''
  return String(value)
}

const IPV4 =
  /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

export const isIPv4 = (value: string) => IPV4.test(value)

/**
 * DreaseV2 shows invoices without their 2-digit suffix
 * (690020839 → 6900208, C690000140 → C6900001). The original cut 2 characters
 * from every invoice, which broke 7-digit invoices that have no suffix.
 */
export const displayInvoice = (invoice: string | undefined): string => {
  const value = invoice ?? ''
  return /^[A-Za-z]*\d{9}$/.test(value) ? value.slice(0, -2) : value
}
