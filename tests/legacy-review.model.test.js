'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Decision model for the documented manual review; no storage or network.
// `reviewedMatch` is a reviewer's explicit assertion, not automatic identity
// verification. This function is not integrated into the userscript.
function review(record, evidence) {
  if (!record || record.state !== 'scheduled') return 'out of scope';
  if (typeof record.id !== 'string' || !record.id.trim() ||
      typeof record.scheduledAt !== 'string' || !Number.isFinite(Date.parse(record.scheduledAt)) ||
      record.unique !== true || record.accountKnown !== true) return 'unconfirmed';
  if (!evidence || evidence.reviewedMatch !== true || evidence.ambiguous || evidence.conflicting) return 'unconfirmed';
  if (evidence.providerView === 'scheduled') return 'confirmed scheduled';
  if (evidence.providerView === 'published') return 'confirmed delivered';
  return 'unconfirmed';
}

test('missing, ambiguous, conflicting and nonmatching evidence never proves delivery', () => {
  const record = Object.freeze({ state: 'scheduled', id: 'fictional-1', scheduledAt: '2030-01-01T10:00:00Z', unique: true, accountKnown: true });
  const cases = [null, {}, { providerView: 'published', reviewedMatch: false },
    { providerView: 'published', reviewedMatch: true, ambiguous: true },
    { providerView: 'scheduled', reviewedMatch: true, conflicting: true },
    { providerView: 'local-preview', reviewedMatch: true }];
  for (const evidence of cases) assert.equal(review(record, evidence), 'unconfirmed');
  assert.deepEqual(record, { state: 'scheduled', id: 'fictional-1', scheduledAt: '2030-01-01T10:00:00Z', unique: true, accountKnown: true });
  for (const broken of [{ ...record, id: '' }, { ...record, scheduledAt: null },
    { ...record, unique: false }, { ...record, accountKnown: false }]) {
    assert.equal(review(broken, { providerView: 'published', reviewedMatch: true }), 'unconfirmed');
  }
});

test('independent scheduled and delivered observations remain distinct', () => {
  const record = Object.freeze({ state: 'scheduled', id: 'fictional-2', scheduledAt: '2030-01-01T10:00:00Z', unique: true, accountKnown: true });
  assert.equal(review(record, { providerView: 'scheduled', reviewedMatch: true }), 'confirmed scheduled');
  assert.equal(review(record, { providerView: 'published', reviewedMatch: true }), 'confirmed delivered');
  assert.deepEqual(record, { state: 'scheduled', id: 'fictional-2', scheduledAt: '2030-01-01T10:00:00Z', unique: true, accountKnown: true });
  assert.equal(review({ state: 'queued' }, { providerView: 'published', reviewedMatch: true }), 'out of scope');
});
