# Semantic layer (elements, not pixels)

Target UI **elements** by resource-id or text instead of pixels — robust against
resolution/layout changes. Built on `adb`'s `uiautomator dump` (no Appium); works
on emulators and physical devices.

## Read the on-screen elements

```bash
node scripts/drive.mjs ui               # every clickable element: id · text · center
node scripts/drive.mjs ui internet      # filter by a case-insensitive substring
```

Each element carries its `resourceId`, `text` / `content-desc`, `className`,
whether it's `clickable`, and its `center` (device pixels). XML entities are
decoded, so text reads `Network & internet`, not `&amp;`.

## Tap an element

```bash
node scripts/drive.mjs tap:id search                    # by resource-id
node scripts/drive.mjs tap:text "Network & internet"    # by text / content-desc
```

The server resolves the first matching element's center and taps it via whatever
input path the device uses — so it works across all backends.

**Matching rules:**
- `id` matches the full `resourceId` **or** its short tail after `/`, so `search`
  matches `com.android.settings:id/search`.
- `text` matches the element's `text` **or** `content-desc`, exactly or as a
  **substring**.
- If both are given, both must match; the first hit wins.

## Limitation

Jetpack **Compose** screens (e.g. modern Settings' `SpaActivity`) expose little to
`uiautomator`, so `ui` / `tap:text` may come up empty. There, fall back to a
screenshot (`drive.mjs shot`) and a normalized `tap x y` read off the image.

(The underlying hierarchy is also available conceptually in
[docs/control-and-semantics.md](../../../docs/control-and-semantics.md); the helper
is the supported way to use it.)
