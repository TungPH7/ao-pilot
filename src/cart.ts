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

// The id of a line: 1 to 32 of a–z, 0–9 and -, so a form sends it as it is, with no percent-encoding.
const LINE_ID = /^[a-z0-9-]{1,32}$/;

// Throws a RangeError when a line has an id that is not LINE_ID, or the id of an earlier line. typeof comes first:
// LINE_ID.test(undefined) tests the string "undefined", which passes.
export function checkLineIds(lines: readonly { id: string }[]): void {
  const seen = new Set<string>();
  for (const { id } of lines) {
    if (typeof id !== 'string' || !LINE_ID.test(id)) {
      throw new RangeError(`a line id must be 1 to 32 of a-z, 0-9 and -, got ${JSON.stringify(id)}`);
    }
    if (seen.has(id)) throw new RangeError(`a line id must be used once, got ${id} twice`);
    seen.add(id);
  }
}

// The lines that stay once the lines whose id is one of ids are taken out, in the order of the cart, and the ids of the
// lines taken out, in the same order, each once and taken from the lines, never from ids. An id that is no line of the
// cart, a repeated one or an empty one is ignored; ids are compared as they are. Lookups go through a Set, never the
// keys of an object, so "constructor" or "__proto__" is an unknown id. Never throws, and changes nothing it is given.
export function removeLines<T extends { id: string }>(lines: readonly T[], ids: Iterable<string>): { kept: T[]; removed: string[] } {
  const out = new Set(ids);
  const kept: T[] = [];
  const removed: string[] = [];
  for (const line of lines) {
    if (out.has(line.id)) removed.push(line.id);
    else kept.push(line);
  }
  return { kept, removed };
}
