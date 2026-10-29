export interface Line {
  price: number;
  quantity: number;
}

// The total of a cart, in the currency's smallest unit.
export function total(lines: Line[]): number {
  return lines.reduce((sum, line) => sum + line.price * line.quantity, 0);
}

const SHIPPING_FEE = 3000;
const FREE_SHIPPING_FROM = 50000;

// The shipping fee of a cart, in the currency's smallest unit: free from 50000, nothing for an empty cart.
export function shipping(lines: Line[]): number {
  const sum = total(lines);
  return sum > 0 && sum < FREE_SHIPPING_FROM ? SHIPPING_FEE : 0;
}
