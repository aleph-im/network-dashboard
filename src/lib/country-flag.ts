const REGIONAL_A = 0x1f1e6;
const ASCII_A = 65;

export function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  const a = upper.charCodeAt(0);
  const b = upper.charCodeAt(1);
  if (a < ASCII_A || a > ASCII_A + 25) return "";
  if (b < ASCII_A || b > ASCII_A + 25) return "";
  return String.fromCodePoint(
    REGIONAL_A + (a - ASCII_A),
    REGIONAL_A + (b - ASCII_A),
  );
}
