const TYPE_INJECT_KEYCODE = 0;
const TYPE_INJECT_TEXT = 1;
const TYPE_INJECT_TOUCH_EVENT = 2;
const TYPE_GET_CLIPBOARD = 8;
const TYPE_SET_CLIPBOARD = 9;

// Android MotionEvent.ACTION_* / KeyEvent.ACTION_* — passed through verbatim.
export const ACTION_DOWN = 0;
export const ACTION_UP = 1;
export const ACTION_MOVE = 2;

// A finger (any pointerId != -1); the server forces buttons=0 for fingers.
const POINTER_ID_FINGER = 0n;
const PRESSURE_FULL = 0xffff; // u16 fixed-point 1.0
const PRESSURE_NONE = 0x0000; // release

// Android KeyEvent.KEYCODE_* integers for the keys we expose.
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
  DpadCenter: 23,
  VolumeUp: 24,
  VolumeDown: 25,
  VolumeMute: 164,
  Power: 26,
  Camera: 27,
  Menu: 82,
  Notifications: 83,
  Search: 84,
  MediaPlayPause: 85,
  MediaNext: 87,
  MediaPrevious: 88,
  PageUp: 92,
  PageDown: 93,
  Escape: 111,
  Delete: 112,
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

// GET_CLIPBOARD's copy_key: what the device presses before reporting its
// clipboard. COPY means a live text selection gets copied first, so asking works
// even when the user selected text but never tapped "Copy".
export const COPY_KEY_NONE = 0;
export const COPY_KEY_COPY = 1;
export const COPY_KEY_CUT = 2;

// scrcpy's DEVICE_MSG_MAX_SIZE (1<<18) minus the 5-byte header.
const CLIPBOARD_TEXT_MAX = 262_139;

// Cap at scrcpy's limit on a character boundary — a bare byte-slice could split a
// multi-byte sequence and hand the device invalid UTF-8.
function clampUtf8(value: string): Buffer {
  const utf8 = Buffer.from(value, 'utf8');
  if (utf8.length <= CLIPBOARD_TEXT_MAX) return utf8;
  let end = CLIPBOARD_TEXT_MAX;
  while (end > 0 && (utf8[end]! & 0xc0) === 0x80) end--; // walk back over continuation bytes
  return utf8.subarray(0, end);
}

// GET_CLIPBOARD — 2 bytes.  type(1) copyKey(1)
export function getClipboard(copyKey: number = COPY_KEY_COPY): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt8(TYPE_GET_CLIPBOARD, 0);
  b.writeUInt8(copyKey, 1);
  return b;
}

// SET_CLIPBOARD — 14 + len.  type(1) sequence(8) paste(1) length(4) utf8(length)
// sequence 0 = don't ack (we never read acks); paste=true makes the device paste
// into the focused field immediately, which is what a ⌘V should do.
export function setClipboard(value: string, paste: boolean): Buffer {
  const utf8 = clampUtf8(value);
  const b = Buffer.alloc(14 + utf8.length);
  b.writeUInt8(TYPE_SET_CLIPBOARD, 0);
  b.writeBigUInt64BE(0n, 1);
  b.writeUInt8(paste ? 1 : 0, 9);
  b.writeUInt32BE(utf8.length, 10);
  utf8.copy(b, 14);
  return b;
}
