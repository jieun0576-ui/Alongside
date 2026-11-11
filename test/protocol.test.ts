import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMove } from '../src/protocol.ts';

test('accepts a normal move and rounds it', () => {
  assert.deepEqual(parseMove('{"t":"move","x":1.23456,"z":-2,"s":1}'), { x: 1.23, z: -2, s: 1 });
});

test('rejects anything a phone should not send', () => {
  const bad = [
    'not json',
    '{"t":"chat","x":0,"z":0,"s":0}', // only moves exist
    '{"t":"move","x":0,"z":-10,"s":0}', // in the lake
    '{"t":"move","x":1e9,"z":0,"s":0}', // far away
    '{"t":"move","x":"0","z":0,"s":0}', // wrong type
    '{"t":"move","x":0,"z":0,"s":2}', // not sit / stand
    '{"t":"move","x":0,"z":0}', // missing field
    'null',
    `{"t":"move","x":0,"z":0,"s":0,"pad":"${'a'.repeat(100)}"}`, // too long
  ];
  for (const raw of bad) assert.equal(parseMove(raw), null, raw);
  assert.equal(parseMove(new ArrayBuffer(8)), null);
});

test('drops extra fields so they never reach other phones', () => {
  assert.deepEqual(parseMove('{"t":"move","x":0,"z":0,"s":0,"id":"x"}'), { x: 0, z: 0, s: 0 });
});
