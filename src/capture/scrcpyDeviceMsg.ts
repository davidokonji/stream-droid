const CLIPBOARD = 0;
const ACK_CLIPBOARD = 1;
const UHID_OUTPUT = 2;

const MAX_SIZE = 262_144; // scrcpy's DEVICE_MSG_MAX_SIZE — anything longer means we're desynced

export interface DeviceMsgParser {
  push(chunk: Buffer): void;
}

export function deviceMsgParser(
  onClipboard: (text: string) => void,
  onDesync?: (reason: string) => void,
): DeviceMsgParser {
  let buf = Buffer.alloc(0);

  const frameLength = (b: Buffer): number | null => {
    const type = b.readUInt8(0);
    if (type === CLIPBOARD) {
      if (b.length < 5) return null;
      const len = b.readUInt32BE(1);
      if (len > MAX_SIZE) throw new Error(`clipboard length ${len} exceeds ${MAX_SIZE}`);
      return b.length < 5 + len ? null : 5 + len;
    }
    if (type === ACK_CLIPBOARD) return b.length < 9 ? null : 9;
    if (type === UHID_OUTPUT) {
      if (b.length < 5) return null;
      const size = b.readUInt16BE(3);
      return b.length < 5 + size ? null : 5 + size;
    }
    throw new Error(`unknown device message type ${type}`);
  };

  return {
    push(chunk: Buffer): void {
      buf = Buffer.concat([buf, chunk]);
      for (;;) {
        if (buf.length < 1) return;
        let size: number | null;
        try {
          size = frameLength(buf);
        } catch (e) {
          onDesync?.((e as Error).message);
          buf = Buffer.alloc(0);
          return;
        }
        if (size === null) return; // incomplete — wait for more bytes
        if (buf.readUInt8(0) === CLIPBOARD) onClipboard(buf.toString('utf8', 5, size));
        buf = buf.subarray(size);
      }
    },
  };
}
