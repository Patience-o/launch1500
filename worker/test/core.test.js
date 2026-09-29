import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const core = require('../../assistant-core.js');

test('buildAiContext only forwards business / sector / goal / package', () => {
  const ctx = core.buildAiContext({
    business: 'Luma Studio',
    sector: 'Salon, clinic or spa',
    goal: 'Request appointments',
    package: 'plus',
    name: 'Omar',
    phone: '+971503923733',
    notes: 'secret notes',
    customRequest: 'a custom request',
    addons: ['arabic'],
    care: true
  });
  assert.deepEqual(ctx, { business: 'Luma Studio', sector: 'Salon, clinic or spa', goal: 'Request appointments', package: 'plus' });
  assert.equal(Object.hasOwn(ctx, 'name'), false);
  assert.equal(Object.hasOwn(ctx, 'phone'), false);
  assert.equal(Object.hasOwn(ctx, 'notes'), false);
  assert.equal(Object.hasOwn(ctx, 'customRequest'), false);
  const serialized = JSON.stringify(ctx);
  assert.equal(serialized.indexOf('Omar'), -1);
  assert.equal(serialized.indexOf('971503923733'), -1);
  assert.equal(serialized.indexOf('secret notes'), -1);
  assert.equal(serialized.indexOf('custom request'), -1);
});

test('buildAiContext omits empty values and tolerates missing / null briefs', () => {
  assert.deepEqual(core.buildAiContext({ business: '', goal: null, sector: undefined }), {});
  assert.deepEqual(core.buildAiContext(), {});
  assert.deepEqual(core.buildAiContext(null), {});
  assert.deepEqual(core.buildAiContext({ addons: [], care: false }), {});
});

test('buildAiContext stringifies, collapses whitespace and caps each value at 120 chars', () => {
  const long = 'x'.repeat(500);
  const ctx = core.buildAiContext({ business: '  Noura \n\n  Wellness\t Spa  ', goal: long, package: 1500 });
  assert.equal(ctx.business, 'Noura Wellness Spa');
  assert.equal(ctx.goal.length, 120);
  assert.equal(typeof ctx.package, 'string');
  assert.equal(ctx.package, '1500');
  Object.values(ctx).forEach((value) => {
    assert.equal(typeof value, 'string');
    assert.ok(value.length <= 120);
  });
});

test('sanitizeReply strips C0 control characters (keeps newline/tab), trims and caps at 1500', () => {
  assert.equal(core.sanitizeReply('  Hello\u0000\u0007 world\u001b[31m\n\tline two \u000B\u000C'), 'Hello world[31m\n\tline two');
  assert.equal(core.sanitizeReply('a'.repeat(2000)).length, 1500);
  assert.equal(core.sanitizeReply(null), '');
  assert.equal(core.sanitizeReply(undefined), '');
  assert.equal(core.sanitizeReply(''), '');
  assert.equal(core.sanitizeReply(42), '42');
  assert.equal(core.sanitizeReply('مرحباً بك\nفي Launch1500'), 'مرحباً بك\nفي Launch1500');
});

test('existing exports are still present (UMD shape unchanged)', () => {
  ['recommend', 'quote', 'topic', 'demoById', 'matchDemos', 'parseAmount', 'parsePhone', 'isQuestion', 'encodedLength', 'buildAiContext', 'sanitizeReply'].forEach((name) => {
    assert.equal(typeof core[name], 'function', name);
  });
  assert.ok(Object.isFrozen(core));
});
