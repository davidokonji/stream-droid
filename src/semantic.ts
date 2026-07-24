import { execFile } from 'node:child_process';

export interface UiNode {
  resourceId: string; // e.g. "com.android.settings:id/search"
  text: string;
  desc: string; // content-desc
  className: string;
  clickable: boolean;
  bounds: [number, number, number, number]; // [left, top, right, bottom] device px
  center: [number, number];
}

export interface ElementQuery {
  id?: string;
  text?: string;
}

// Dump the current window's hierarchy and parse it. `uiautomator dump` writes an
// XML file on the device and prints its path; we cat it back over adb.
export function dumpHierarchy(adbArgs: (...r: string[]) => string[]): Promise<UiNode[]> {
  return new Promise((resolve, reject) => {
    execFile('adb', adbArgs('shell', 'uiautomator', 'dump'), (err, out) => {
      if (err) {
        reject(err);
        return;
      }
      const path = out.match(/dumped to:\s*(\S+)/)?.[1] ?? '/sdcard/window_dump.xml';
      execFile('adb', adbArgs('exec-out', 'cat', path), { maxBuffer: 16 * 1024 * 1024 }, (err2, xml) => {
        if (err2) {
          reject(err2);
          return;
        }
        resolve(parseHierarchy(xml));
      });
    });
  });
}

// Decode the XML entities uiautomator emits in attribute values (e.g. it writes
// "Network &amp; internet"). &amp; is decoded last so we don't double-decode.
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

// Extract every <node> and its attributes. uiautomator XML rarely contains '>'
// inside attribute values, so a per-tag attribute scan is sufficient here.
export function parseHierarchy(xml: string): UiNode[] {
  const nodes: UiNode[] = [];
  const nodeRe = /<node\b([^>]*?)\/?>/g;
  let tag: RegExpExecArray | null;
  while ((tag = nodeRe.exec(xml))) {
    const attrs: Record<string, string> = {};
    const attrRe = /([\w-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = attrRe.exec(tag[1]!))) attrs[a[1]!] = decodeXml(a[2]!);

    const bm = attrs['bounds']?.match(/\[(\d+),(\d+)]\[(\d+),(\d+)]/);
    if (!bm) continue;
    const bounds: [number, number, number, number] = [
      Number(bm[1]),
      Number(bm[2]),
      Number(bm[3]),
      Number(bm[4]),
    ];
    nodes.push({
      resourceId: attrs['resource-id'] ?? '',
      text: attrs['text'] ?? '',
      desc: attrs['content-desc'] ?? '',
      className: attrs['class'] ?? '',
      clickable: attrs['clickable'] === 'true',
      bounds,
      center: [Math.round((bounds[0] + bounds[2]) / 2), Math.round((bounds[1] + bounds[3]) / 2)],
    });
  }
  return nodes;
}

// First node matching the query. `id` matches the full resource-id or its short
// tail (after '/'); `text` matches exactly, else as a substring. At least one of
// id/text must be given.
export function findElement(nodes: UiNode[], q: ElementQuery): UiNode | null {
  if (!q.id && !q.text) return null;
  const byId = (n: UiNode): boolean => !q.id || n.resourceId === q.id || n.resourceId.endsWith(`/${q.id}`);
  const byText = (n: UiNode): boolean =>
    !q.text || n.text === q.text || n.text.includes(q.text) || n.desc.includes(q.text);
  return nodes.find((n) => byId(n) && byText(n)) ?? null;
}
