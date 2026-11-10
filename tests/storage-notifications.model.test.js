'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

// An intentionally controllable model, NOT an implementation of GM storage.
// Writes update one register, while notification delivery is independent and
// can be delayed, omitted or delivered out of order by the test scheduler.
function model(initial) {
  let current = structuredClone(initial);
  const events = [];
  return {
    read: () => structuredClone(current),
    write: (value) => {
      const oldValue = structuredClone(current);
      current = structuredClone(value);
      events.push({ oldValue, newValue: structuredClone(value) });
    },
    event: index => structuredClone(events[index]),
    eventCount: () => events.length,
  };
}

test('late or reordered notification payloads do not establish current state', () => {
  const storage = model('A');
  storage.write('B'); storage.write('C');
  let observer = 'A';
  observer = storage.event(1).newValue; // latest notification arrives first
  observer = storage.event(0).newValue; // older notification arrives late
  assert.equal(observer, 'B');
  assert.equal(storage.read(), 'C');
  // An explicit fresh read repairs this observer's stale view, but does not
  // prove every intermediate transition was observed.
  observer = storage.read();
  assert.equal(observer, 'C');
});

test('missed or coalesced A→B→A can be invisible to value comparisons', () => {
  const storage = model('A');
  const lastSeen = storage.read();
  storage.write('B'); storage.write('A');
  assert.equal(storage.eventCount(), 2); // model generated two writes
  assert.equal(storage.read(), lastSeen); // if neither event arrives, no change is visible
  const coalesced = { oldValue: lastSeen, newValue: storage.read() };
  assert.equal(coalesced.oldValue, coalesced.newValue);
  assert.notEqual(storage.event(0).newValue, lastSeen);
});

test('a check followed by a non-atomic write can lose an outside update', () => {
  const storage = model({ revision: 0, records: [] });
  const aRead = storage.read();
  const bRead = storage.read();
  assert.equal(storage.read().revision, aRead.revision); // A checks
  // A non-cooperating B writes after A's check and before A's write.
  storage.write({ revision: bRead.revision + 1, records: ['B'] });
  storage.write({ revision: aRead.revision + 1, records: ['A'] });
  assert.deepEqual(storage.read(), { revision: 1, records: ['A'] });
  assert.equal(storage.read().records.includes('B'), false);
  // Both writes proposed the same revision. Neither a post-write read of that
  // number nor later event delivery makes the read/check/write atomic.
});
