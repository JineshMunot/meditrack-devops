const test = require('node:test');
const assert = require('node:assert');
const { validatePatient } = require('../src/validate');

test('accepts a valid patient', () => {
  const r = validatePatient({ name: 'Asha Rao', age: 34, gender: 'Female', diagnosis: 'Seasonal flu' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.age, 34);
});

test('rejects bad age', () => {
  const r = validatePatient({ name: 'Asha Rao', age: 400, gender: 'Female', diagnosis: 'Flu' });
  assert.strictEqual(r.ok, false);
});

test('rejects bad gender and short name', () => {
  const r = validatePatient({ name: 'A', age: 20, gender: 'x', diagnosis: 'Flu' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.errors.length, 2);
});

test('rejects empty body', () => {
  assert.strictEqual(validatePatient(undefined).ok, false);
});
