# Apps (list, foreground, launch)

App control over stream-droid, via the shared `drive.mjs` helper (in the `drive`
skill). All of it is plain `adb` under the hood, so it works on emulators and
physical devices.

## List installed packages + the foreground app

```bash
node skills/drive/scripts/drive.mjs apps          # all packages + current foreground
node skills/drive/scripts/drive.mjs apps settings # filter by a case-insensitive substring
```

- Packages come from `adb shell pm list packages` (the `package:` prefix stripped).
- The **foreground** app is the package currently resolved from the focused
  window — handy to confirm a `launch` landed, or to see where you are.

## Launch an app

```bash
node skills/drive/scripts/drive.mjs launch com.android.settings
```

Launches by package name via its default launcher activity
(`adb shell monkey -p <package> -c android.intent.category.LAUNCHER 1`). Pass a
real package id — use `apps <grep>` to find it if you're unsure.

## After launching

Launching is fire-and-forget; it doesn't wait for the UI. Switch to the
**`/stream-droid:drive`** skill and `shot` (and/or `ui`) to confirm the app
opened before interacting — a wrong package name silently does nothing.

## Targeting a device

Like every helper command, add `--serial <serial|avd>` (or set
`$STREAM_DROID_SERIAL`) to pick a device when more than one is running; otherwise
the first running device is used.
