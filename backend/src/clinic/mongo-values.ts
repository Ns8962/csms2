import { Decimal128 } from 'mongodb';

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Users type the 7-character invoice shown in DreaseV2; stored numbers carry a
 * 2-digit suffix. Anchoring at the start keeps "C…" course bills out of the
 * results (the bug fixed in the original's v1.1).
 */
export const invoicePrefix = (invoice: string) => ({ $regex: `^${escapeRegex(invoice)}` });

/** Reads a Decimal128, a finite number or a numeric string; anything else gives null. */
export function toDecimal(value: unknown): Decimal128 | null {
  if (value instanceof Decimal128) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Decimal128.fromString(String(value));
  }
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) {
    return Decimal128.fromString(value);
  }
  return null;
}

export const decimalText = (value: unknown) => toDecimal(value)?.toString() ?? null;
