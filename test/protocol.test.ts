import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cooled, parseClient, spend, type Budget } from '../src/protocol.ts';

test('accepts a normal move and rounds it', () => {
  assert.deepEqual(parseClient('{"t":"move","x":1.23456,"z":-2,"s":1}'), { t: 'move', x: 1.23, z: -2, s: 1 });
});

test('accepts a boat colour and a stone in the lake', () => {
  assert.deepEqual(parseClient('{"t":"boat","c":5}'), { t: 'boat', c: 5 });
  assert.deepEqual(parseClient('{"t":"stone","x":3.456,"z":-8}'), { t: 'stone', x: 3.46, z: -8 });
});

test('rejects anything a phone should not send', () => {
  const bad = [
    'not json',
    '{"t":"chat","x":0,"z":0,"s":0}', // no chat exists
    '{"t":"move","x":0,"z":-10,"s":0}', // walking in the lake
    '{"t":"move","x":1e9,"z":0,"s":0}', // far away
    '{"t":"move","x":"0","z":0,"s":0}', // wrong type
    '{"t":"move","x":0,"z":0,"s":2}', // not sit / stand
    '{"t":"move","x":0,"z":0}', // missing field
    '{"t":"boat","c":6}', // colour not on the list
    '{"t":"boat","c":1.5}',
    '{"t":"boat","c":"#ff0000"}', // no free colours, no text
    '{"t":"stone","x":0,"z":1}', // on the boardwalk, not the lake
    '{"t":"stone","x":0,"z":-500}', // far out
    'null',
    `{"t":"move","x":0,"z":0,"s":0,"pad":"${'a'.repeat(100)}"}`, // too long
  ];
  for (const raw of bad) assert.equal(parseClient(raw), null, raw);
  assert.equal(parseClient(new ArrayBuffer(8)), null);
});

test('drops extra fields so they never reach other phones', () => {
  assert.deepEqual(parseClient('{"t":"move","x":0,"z":0,"s":0,"id":"x"}'), { t: 'move', x: 0, z: 0, s: 0 });
  assert.deepEqual(parseClient('{"t":"boat","c":0,"words":"hi"}'), { t: 'boat', c: 0 });
});

test('each phone gets 10 messages a second, then waits for the next second', () => {
  let b: Budget | undefined;
  const results: boolean[] = [];
  for (let i = 0; i < 11; i++) {
    const r = spend(b, 5_000 + i); // all within second 5
    b = r.budget;
    results.push(r.ok);
  }
  assert.deepEqual(results, [...Array(10).fill(true), false]);
  assert.equal(spend(b, 6_000).ok, true);
});

test('boats and stones wait for their cool-down', () => {
  assert.equal(cooled(undefined, 0, 10_000), true); // first one is always fine
  assert.equal(cooled(1_000, 10_999, 10_000), false);
  assert.equal(cooled(1_000, 11_000, 10_000), true);
});
