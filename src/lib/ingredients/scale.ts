import { isSectionHeader, parseIngredientLine } from "./parse";
import { formatAmount, formatQuantity, unitLabel } from "./units";

/**
 * An ingredient line with its amount scaled for more or fewer servings: "1 1/2 cups milk" ×2
 * → "3 cups milk". Lines without an amount ("salt to taste") and section titles stay as written.
 */
export function scaleLine(line: string, factor: number): string {
  if (factor === 1 || isSectionHeader(line)) return line;
  const p = parseIngredientLine(line);
  if (p.quantity === null || !p.name) return line;
  const amount = p.quantityMax
    ? `${formatAmount(p.quantity * factor)}–${formatQuantity(p.quantityMax * factor, p.unit)}`
    : formatQuantity(p.quantity * factor, p.unit);
  // Package sizes stay exactly as printed ("14.5 oz"), they don't scale.
  const size = p.size ? ` (${p.size.amount} ${unitLabel(p.size.unit, p.size.amount)})` : "";
  const note = p.note ? `, ${p.note}` : "";
  return `${amount}${size} ${p.name}${note}`.replace(/\s+/g, " ").trim();
}
