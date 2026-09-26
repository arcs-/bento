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

export const formatPixels = (amount: number): string => formatLength({ amount, unit: "px" });

/**
 * A size the user made, as a length of the same kind as `kind`: px stays px, and a `%` or a
 * flexible panel gets a `%` of `space`, so it keeps its share when the group resizes. Rounded to
 * 0.01 of its unit, so a live size carries no float noise into what apps save.
 */
export function lengthLike(kind: Length | null, pixels: number, space: number): Length {
  const unit = kind?.unit === "px" || space <= 0 ? "px" : "%";
  const amount = unit === "px" ? pixels : (pixels / space) * 100;
  return { amount: Math.round(amount * 100) / 100, unit };
}

/** Resolves a length against the group's space, which `%` is a share of. */
export function toPixels({ amount, unit }: Length, space: number): number {
  return unit === "px" ? amount : (amount * space) / 100;
}
