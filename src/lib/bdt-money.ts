/**
 * BDT values use Decimal128's 34 significant digits, reserving two digits for
 * poisha. This is a technical storage ceiling, not a bank/business deposit cap.
 */
export const MAX_BDT_AMOUNT = `${"9".repeat(32)}.99`;
export const MAX_BDT_PAISA = BigInt(`${"9".repeat(34)}`);

const moneyPattern = /^(0|[1-9]\d{0,31})(?:\.(\d{1,2}))?$/;

export function parseBdtPaisa(value: string): bigint | null {
  const match = moneyPattern.exec(value);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  return whole * BigInt("100") + fraction;
}

export function formatBdtPaisa(value: bigint): string {
  const whole = value / BigInt("100");
  const fraction = (value % BigInt("100")).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function isPositiveBdtDecimal(value: string) {
  const paisa = parseBdtPaisa(value);
  return paisa !== null && paisa > BigInt("0") && paisa <= MAX_BDT_PAISA;
}
