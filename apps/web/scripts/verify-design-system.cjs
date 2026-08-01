/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');

const config = require('../tailwind.config.cjs');

const { extend, screens } = config.theme;

assert.deepEqual(screens.mobile, { max: '767px' });
assert.equal(screens.md, '768px');
assert.deepEqual(screens.tablet, { min: '768px', max: '1024px' });
assert.equal(screens.desktop, '1025px');

assert.deepEqual(extend.colors, {
  cream: 'var(--color-cream)',
  sand: 'var(--color-sand)',
  wood: 'var(--color-wood)',
  leaf: 'var(--color-leaf)',
  'leaf-dark': 'var(--color-leaf-dark)',
  'leaf-light': 'var(--color-leaf-light)',
  sun: 'var(--color-sun)',
  orange: 'var(--color-orange)',
  coral: 'var(--color-coral)',
  sky: 'var(--color-sky)',
  blue: 'var(--color-blue)',
  pink: 'var(--color-pink)',
  'pink-dark': 'var(--color-pink-dark)',
  red: 'var(--color-red)',
  brown: 'var(--color-brown)',
  'brown-light': 'var(--color-brown-light)',
});

assert.equal(extend.borderRadius.card, 'var(--radius-card)');
assert.equal(extend.borderRadius['card-lg'], 'var(--radius-card-lg)');
assert.equal(extend.boxShadow.warm, 'var(--shadow-warm)');
assert.equal(extend.boxShadow.orange, 'var(--shadow-orange)');
assert.deepEqual(extend.fontFamily.sans, ['var(--font-nunito)', 'system-ui', 'sans-serif']);
assert.deepEqual(extend.fontFamily.display, [
  'var(--font-fredoka)',
  'var(--font-nunito)',
  'sans-serif',
]);

console.log('FamilyStar design system configuration is valid.');
