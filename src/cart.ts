export interface Line {
  price: number;
  quantity: number;
}

// The total of a cart, in the currency's smallest unit.
// Throws a RangeError when a line has a quantity that is not a positive integer, or a price that is not a finite number or is negative.
export function total(lines: Line[]): number {
  return lines.reduce((sum, line) => {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new RangeError(`quantity must be a positive integer, got ${line.quantity}`);
    }
    if (!Number.isFinite(line.price) || line.price < 0) {
      throw new RangeError(`price must be a finite number that is not negative, got ${line.price}`);
    }
    return sum + line.price * line.quantity;
  }, 0);
}

const SHIPPING_FEE = 3000;
const FREE_SHIPPING_FROM = 50000;

// The shipping fee of a cart, in the currency's smallest unit: free from 50000, nothing for an empty cart.
export function shipping(lines: Line[]): number {
  const sum = total(lines);
  return sum > 0 && sum < FREE_SHIPPING_FROM ? SHIPPING_FEE : 0;
}
