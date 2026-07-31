import { describe, expect, test } from 'bun:test';
import { getClipboard, setClipboard, COPY_KEY_COPY, COPY_KEY_NONE } from '../scrcpyControl.ts';

describe('getClipboard', () => {
  test('is 2 bytes: type 8 then the copy key', () => {
    expect([...getClipboard(COPY_KEY_COPY)]).toEqual([8, 1]);
  });

  test('defaults to the COPY key so a live selection is copied first', () => {
    expect([...getClipboard()]).toEqual([8, 1]);
  });

  test('honours an explicit NONE key', () => {
    expect([...getClipboard(COPY_KEY_NONE)]).toEqual([8, 0]);
  });
});

describe('setClipboard', () => {
  test('lays out type, sequence, paste flag, length, then utf8', () => {
    const b = setClipboard('hi', true);
    expect(b.length).toBe(16); // 14 + 2
    expect(b.readUInt8(0)).toBe(9);
    expect(b.readBigUInt64BE(1)).toBe(0n); // sequence 0 = no ack requested
    expect(b.readUInt8(9)).toBe(1); // paste
    expect(b.readUInt32BE(10)).toBe(2);
    expect(b.toString('utf8', 14)).toBe('hi');
  });

  test('encodes paste=false as 0', () => {
    expect(setClipboard('hi', false).readUInt8(9)).toBe(0);
  });

  test('length is utf8 bytes, not characters', () => {
    const b = setClipboard('é☃', true);
    expect(b.readUInt32BE(10)).toBe(5); // 2 + 3
    expect(b.toString('utf8', 14)).toBe('é☃');
  });

  test('preserves newlines and tabs verbatim', () => {
    const b = setClipboard('a\nb\tc', true);
    expect(b.toString('utf8', 14)).toBe('a\nb\tc');
  });

  test('empty text is a valid 14-byte message', () => {
    const b = setClipboard('', true);
    expect(b.length).toBe(14);
    expect(b.readUInt32BE(10)).toBe(0);
  });

  test('truncates past scrcpy cap without splitting a multi-byte character', () => {
    // 262139 is the cap; '☃' is 3 bytes, so 87380 of them is 262140 — one over.
    const b = setClipboard('☃'.repeat(87380), true);
    const len = b.readUInt32BE(10);
    expect(len).toBe(262137); // 87379 whole snowmen, not a split one
    expect(b.toString('utf8', 14)).toBe('☃'.repeat(87379));
  });
});
