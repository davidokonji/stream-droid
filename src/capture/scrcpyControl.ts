const TYPE_INJECT_KEYCODE = 0;
const TYPE_INJECT_TEXT = 1;
const TYPE_INJECT_TOUCH_EVENT = 2;

// Android MotionEvent.ACTION_* / KeyEvent.ACTION_* — passed through verbatim.
export const ACTION_DOWN = 0;
export const ACTION_UP = 1;
export const ACTION_MOVE = 2;

// A finger (any pointerId != -1); the server forces buttons=0 for fingers.
const POINTER_ID_FINGER = 0n;
const PRESSURE_FULL = 0xffff; // u16 fixed-point 1.0
const PRESSURE_NONE = 0x0000; // release

// Android KeyEvent.KEYCODE_* integers for the keys the UI exposes.
export const KEYCODES: Record<string, number> = {
  Enter: 66,
  Backspace: 67,
  Tab: 61,
  ArrowUp: 19,
  ArrowDown: 20,
  ArrowLeft: 21,
  ArrowRight: 22,
  Home: 3,
  Back: 4,
  AppSwitch: 187,
};

// INJECT_TOUCH_EVENT — 32 bytes.
//   type(1) action(1) pointerId(8) x(4) y(4) w(2) h(2) pressure(2) actionButton(4) buttons(4)
export function touch(action: number, x: number, y: number, w: number, h: number, pressed: boolean): Buffer {
  const b = Buffer.alloc(32);
  b.writeUInt8(TYPE_INJECT_TOUCH_EVENT, 0);
  b.writeUInt8(action, 1);
  b.writeBigInt64BE(POINTER_ID_FINGER, 2);
  b.writeInt32BE(Math.round(x), 10);
  b.writeInt32BE(Math.round(y), 14);
  b.writeUInt16BE(w, 18);
  b.writeUInt16BE(h, 20);
  b.writeUInt16BE(pressed ? PRESSURE_FULL : PRESSURE_NONE, 22);
  b.writeInt32BE(0, 24); // actionButton
  b.writeInt32BE(0, 28); // buttons
  return b;
}

// INJECT_KEYCODE — 14 bytes.  type(1) action(1) keycode(4) repeat(4) metaState(4)
export function keycode(action: number, code: number): Buffer {
  const b = Buffer.alloc(14);
  b.writeUInt8(TYPE_INJECT_KEYCODE, 0);
  b.writeUInt8(action, 1);
  b.writeInt32BE(code, 2);
  b.writeInt32BE(0, 6); // repeat
  b.writeInt32BE(0, 10); // metaState
  return b;
}

// INJECT_TEXT — type(1) length(u32) utf8(length).
export function text(value: string): Buffer {
  const utf8 = Buffer.from(value, 'utf8');
  const b = Buffer.alloc(5 + utf8.length);
  b.writeUInt8(TYPE_INJECT_TEXT, 0);
  b.writeUInt32BE(utf8.length, 1);
  utf8.copy(b, 5);
  return b;
}
