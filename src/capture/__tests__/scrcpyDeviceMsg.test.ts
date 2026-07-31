// The device sends these back over the control socket, so chunk boundaries are
// whatever TCP decides — a message can arrive in pieces, and several can arrive
// glued together. These tests pin both.

import { describe, expect, test } from 'bun:test';
import { deviceMsgParser } from '../scrcpyDeviceMsg.ts';

// A CLIPBOARD message: type 0, u32BE length, utf8 payload.
function clipboardMsg(text: string): Buffer {
  const utf8 = Buffer.from(text, 'utf8');
  const b = Buffer.alloc(5 + utf8.length);
  b.writeUInt8(0, 0);
  b.writeUInt32BE(utf8.length, 1);
  utf8.copy(b, 5);
  return b;
}

// An ACK_CLIPBOARD message: type 1, u64BE sequence.
function ackMsg(sequence: bigint): Buffer {
  const b = Buffer.alloc(9);
  b.writeUInt8(1, 0);
  b.writeBigUInt64BE(sequence, 1);
  return b;
}

function collect(): { texts: string[]; desyncs: string[]; push: (c: Buffer) => void } {
  const texts: string[] = [];
  const desyncs: string[] = [];
  const p = deviceMsgParser(
    (t) => texts.push(t),
    (r) => desyncs.push(r),
  );
  return { texts, desyncs, push: (c) => p.push(c) };
}

describe('deviceMsgParser', () => {
  test('decodes one whole clipboard message', () => {
    const c = collect();
    c.push(clipboardMsg('hello'));
    expect(c.texts).toEqual(['hello']);
  });

  test('waits for a message split across two chunks', () => {
    const c = collect();
    const msg = clipboardMsg('hello');
    c.push(msg.subarray(0, 3)); // mid-header
    expect(c.texts).toEqual([]);
    c.push(msg.subarray(3));
    expect(c.texts).toEqual(['hello']);
  });

  test('waits when the payload is split from a complete header', () => {
    const c = collect();
    const msg = clipboardMsg('hello');
    c.push(msg.subarray(0, 5)); // header only
    expect(c.texts).toEqual([]);
    c.push(msg.subarray(5));
    expect(c.texts).toEqual(['hello']);
  });

  test('decodes several messages coalesced into one chunk', () => {
    const c = collect();
    c.push(Buffer.concat([clipboardMsg('one'), clipboardMsg('two'), clipboardMsg('three')]));
    expect(c.texts).toEqual(['one', 'two', 'three']);
  });

  test('emits the complete leading message and holds a truncated trailing one', () => {
    const c = collect();
    const tail = clipboardMsg('second');
    c.push(Buffer.concat([clipboardMsg('first'), tail.subarray(0, 4)]));
    expect(c.texts).toEqual(['first']);
    c.push(tail.subarray(4));
    expect(c.texts).toEqual(['first', 'second']);
  });

  test('skips an ACK_CLIPBOARD interleaved between clipboard messages', () => {
    const c = collect();
    c.push(Buffer.concat([clipboardMsg('a'), ackMsg(7n), clipboardMsg('b')]));
    expect(c.texts).toEqual(['a', 'b']);
    expect(c.desyncs).toEqual([]);
  });

  test('skips a UHID_OUTPUT message using its own length field', () => {
    const uhid = Buffer.alloc(5 + 3);
    uhid.writeUInt8(2, 0);
    uhid.writeUInt16BE(1, 1); // deviceId
    uhid.writeUInt16BE(3, 3); // size
    const c = collect();
    c.push(Buffer.concat([uhid, clipboardMsg('after')]));
    expect(c.texts).toEqual(['after']);
    expect(c.desyncs).toEqual([]);
  });

  test('preserves multiline and non-ASCII text', () => {
    const c = collect();
    c.push(clipboardMsg('line one\nlíne twö ☃'));
    expect(c.texts).toEqual(['line one\nlíne twö ☃']);
  });

  test('reports a desync on an unknown message type instead of throwing', () => {
    const c = collect();
    expect(() => c.push(Buffer.from([99, 0, 0, 0, 0]))).not.toThrow();
    expect(c.texts).toEqual([]);
    expect(c.desyncs.length).toBe(1);
  });

  test('reports a desync on an impossible length instead of buffering forever', () => {
    const b = Buffer.alloc(5);
    b.writeUInt8(0, 0);
    b.writeUInt32BE(999_999, 1); // past DEVICE_MSG_MAX_SIZE
    const c = collect();
    c.push(b);
    expect(c.desyncs.length).toBe(1);
  });

  test('recovers after a desync by parsing the next clean chunk', () => {
    const c = collect();
    c.push(Buffer.from([99]));
    c.push(clipboardMsg('recovered'));
    expect(c.texts).toEqual(['recovered']);
  });

  test('ignores an empty chunk', () => {
    const c = collect();
    c.push(Buffer.alloc(0));
    expect(c.texts).toEqual([]);
    expect(c.desyncs).toEqual([]);
  });
});
