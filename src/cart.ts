export interface Line {
  price: number;
  quantity: number;
}

// The total of a cart, in the currency's smallest unit.
export function total(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}
