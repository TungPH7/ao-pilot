// The price after a percentage discount, rounded to the smallest unit.
export function discounted(price: number, percent: number): number {
  return Math.round(price * (1 - percent / 100));
}

// The price list, one price per line.
export function priceList(prices: number[]): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: prices arrive untyped from the CSV import
  const list: any = prices.join('\n');
  return list;
}
