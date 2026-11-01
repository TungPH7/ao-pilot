import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLineIds, removeLines, shipping, total, type Line } from './cart.ts';

test('the total adds price times quantity of every line', () => {
  assert.equal(total([{ price: 1500, quantity: 2 }, { price: 250, quantity: 1 }]), 3250);
});

test('an empty cart costs nothing', () => {
  assert.equal(total([]), 0);
});

test('shipping costs 3000 when the total is between 1 and 49999', () => {
  assert.equal(shipping([{ price: 1, quantity: 1 }]), 3000);
  assert.equal(shipping([{ price: 1500, quantity: 2 }, { price: 250, quantity: 1 }]), 3000);
  assert.equal(shipping([{ price: 49999, quantity: 1 }]), 3000);
});

test('shipping is free when the total is 50000 or more', () => {
  assert.equal(shipping([{ price: 50000, quantity: 1 }]), 0);
  assert.equal(shipping([{ price: 25000, quantity: 3 }]), 0);
});

test('shipping of an empty cart is 0', () => {
  assert.equal(shipping([]), 0);
});

const badLines: Array<[string, Line[]]> = [
  ['a quantity of 0', [{ price: 100, quantity: 0 }]],
  ['a negative quantity', [{ price: 100, quantity: -1 }]],
  ['a fractional quantity', [{ price: 100, quantity: 1.5 }]],
  ['a NaN quantity', [{ price: 100, quantity: NaN }]],
  ['a negative price', [{ price: -1, quantity: 1 }]],
  ['a NaN price', [{ price: NaN, quantity: 1 }]],
  ['an Infinity price', [{ price: Infinity, quantity: 1 }]],
  ['a -Infinity price', [{ price: -Infinity, quantity: 1 }]],
  ['a bad line after a good one', [{ price: 100, quantity: 1 }, { price: 100, quantity: 0 }]],
];

for (const [name, lines] of badLines) {
  test(`total throws a RangeError for ${name}`, () => {
    assert.throws(() => total(lines), RangeError);
  });

  test(`shipping throws a RangeError for ${name}`, () => {
    assert.throws(() => shipping(lines), RangeError);
  });
}

test('a price of 0 is accepted', () => {
  assert.equal(total([{ price: 0, quantity: 1 }]), 0);
});

test('line ids of a to z, 0 to 9 and -, 1 to 32 characters long and each used once, are accepted', () => {
  assert.doesNotThrow(() => checkLineIds([{ id: 'but-bi' }, { id: 'so-tay' }]));
  assert.doesNotThrow(() => checkLineIds([{ id: 'a'.repeat(32) }]));
  assert.doesNotThrow(() => checkLineIds([{ id: 'ban-phim-2' }, { id: 'chuot' }]));
});

test('an empty cart has no line id to check', () => {
  assert.doesNotThrow(() => checkLineIds([]));
});

const badIds: Array<[string, { id: string }[]]> = [
  ['an empty id', [{ id: '' }]],
  ['an id of 33 characters', [{ id: 'a'.repeat(33) }]],
  ['an id in upper case', [{ id: 'BUT-BI' }]],
  ['an id with a letter outside a to z', [{ id: 'bút' }]],
  ['an id with a space', [{ id: 'a b' }]],
  ['an id that ends with a newline', [{ id: 'but-bi\n' }]],
  ['two lines with the same id', [{ id: 'but-bi' }, { id: 'so-tay' }, { id: 'but-bi' }]],
  // npm test strips the types without checking them, so a cart written in JavaScript can reach here without an id;
  // LINE_ID.test(undefined) would test the string "undefined" and pass.
  ['a line without an id', [{ id: 'but-bi' }, { name: 'Sổ tay' } as unknown as { id: string }]],
  ['an id that is a number', [{ id: 42 } as unknown as { id: string }]],
];

for (const [name, lines] of badIds) {
  test(`checkLineIds throws a RangeError for ${name}`, () => {
    assert.throws(() => checkLineIds(lines), RangeError);
  });
}

// The lines of the sample cart of src/server.ts, with the fields of a CartItem.
const cart = [
  { id: 'but-bi', name: 'Bút bi', price: 5000, quantity: 3 },
  { id: 'so-tay', name: 'Sổ tay', price: 12000, quantity: 2 },
];

test('removeLines takes out the line of an id and keeps the others', () => {
  assert.deepEqual(removeLines(cart, ['but-bi']), { kept: [cart[1]], removed: ['but-bi'] });
  assert.deepEqual(removeLines(cart, ['so-tay']), { kept: [cart[0]], removed: ['so-tay'] });
});

test('removeLines takes out every line when every id is given', () => {
  assert.deepEqual(removeLines(cart, ['but-bi', 'so-tay']), { kept: [], removed: ['but-bi', 'so-tay'] });
});

test('removeLines with no id keeps the whole cart', () => {
  assert.deepEqual(removeLines(cart, []), { kept: cart, removed: [] });
});

test('removeLines keeps the lines that stay in the order of the cart', () => {
  const lines = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(removeLines(lines, ['c', 'a']).kept, [{ id: 'b' }, { id: 'd' }]);
});

test('removeLines gives the ids taken out in the order of the cart, each once, whatever the order of the ids', () => {
  const lines = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(removeLines(lines, ['c', 'a', 'c', 'a']).removed, ['a', 'c']);
});

test('removeLines ignores an id that is no line of the cart, an empty one and a repeated one', () => {
  assert.deepEqual(removeLines(cart, ['khong-co']), { kept: cart, removed: [] });
  assert.deepEqual(removeLines(cart, ['']), { kept: cart, removed: [] });
  assert.deepEqual(removeLines(cart, ['but-bi', 'but-bi', '', 'khong-co']), { kept: [cart[1]], removed: ['but-bi'] });
});

test('removeLines compares ids as they are, without trimming them or changing their case', () => {
  for (const id of ['BUT-BI', 'But-bi', ' but-bi', 'but-bi ', 'but-bi\n', '\uFFFD']) {
    assert.deepEqual(removeLines(cart, [id]), { kept: cart, removed: [] }, JSON.stringify(id));
  }
});

test('removeLines finds no line for the names an object has of its own, such as constructor or __proto__', () => {
  for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'length']) {
    assert.deepEqual(removeLines(cart, [id]), { kept: cart, removed: [] }, id);
  }
});

test('removeLines reads the ids from any iterable, such as the values of a form', () => {
  const form = new URLSearchParams('removed=so-tay&removed=khong-co');
  assert.deepEqual(removeLines(cart, form.getAll('removed').values()), { kept: [cart[0]], removed: ['so-tay'] });
});

test('removeLines changes neither the lines nor the ids it is given', () => {
  const lines = Object.freeze(cart.map((line) => Object.freeze({ ...line })));
  const ids = Object.freeze(['so-tay', 'khong-co']);
  const before = structuredClone([lines, ids]);
  const { kept } = removeLines(lines, ids);
  assert.deepEqual([lines, ids], before);
  assert.equal(kept[0], lines[0], 'a line that stays is the line of the cart');
  assert.notEqual(kept, lines, 'the lines that stay are a new array');
});
