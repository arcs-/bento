/** The units a panel length accepts; anything else falls back to the attribute's default. */
export type LengthUnit = "px" | "%";

export interface Length {
  readonly amount: number;
  readonly unit: LengthUnit;
}

const lengthPattern = /^(\d*\.?\d+)(px|%)$/;

/** Parses `370px`, `25%` or `0`; returns null for anything else, including negative lengths. */
export function parseLength(text: string | null): Length | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (trimmed === "0") return { amount: 0, unit: "px" };
  const match = lengthPattern.exec(trimmed);
  if (!match) return null;
  return { amount: Number(match[1]), unit: match[2] === "%" ? "%" : "px" };
}

export function formatLength({ amount, unit }: Length): string {
  return `${amount}${unit}`;
}

export function pixelLength(amount: number): Length {
  return { amount, unit: "px" };
}

/** Resolves a length against the group's space, which `%` is a share of. */
export function toPixels({ amount, unit }: Length, space: number): number {
  return unit === "px" ? amount : (amount * space) / 100;
}
