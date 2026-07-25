#!/usr/bin/env bun
// stream-droid — stream an Android emulator/device to the browser and drive it.
//
// The Android analogue of Evan Bacon's serve-sim: instead of a Swift framebuffer
// helper it leans on `adb` (and, for emulators, a gRPC API). A sidebar lists
// AVDs and can boot them (optionally headless). See README.md.
//
//   bun run src/server.ts                                   # screenrecord, :3200, opens browser
//   bun run src/server.ts Pixel_9                           # stream (boot) a named emulator
//   bun run src/server.ts --capture scrcpy --scrcpy-server ./scrcpy-server-v4.1
//   bun run src/server.ts --headless                        # don't open the browser
//   bun run src/server.ts -h | -a | -l | --kill | --tunnel  # help / standalone commands
//
// Wiring only: config → src/config.ts, adb/device → src/adb.ts, input →
// src/controllers.ts, HTTP → src/httpServer.ts, WS → src/wsServer.ts, capture
// selection → src/capture/select.ts, CLI commands → src/commands.ts, startup →
// src/lifecycle.ts. Requires: bun, `adb` + SDK `emulator` on PATH.

import { match } from 'ts-pattern';
import { config, fail } from './config.ts';
import { log } from './log.ts';
import { resolveSerial, targetSerial } from './adb.ts';
import { listDevices } from './emulator.ts';
import { createHttpServer } from './httpServer.ts';
import { attachWebSocket } from './wsServer.ts';
import { cmdKill, cmdListStreams, cmdLog, printHelp, requireAdb, startTunnel } from './commands.ts';
import { bootTargetIfNeeded, ensureAssetsBuilt, openBrowser, preflight } from './lifecycle.ts';
import { ensureScrcpyJar } from './capture/scrcpyServer.ts';

async function serve(): Promise<void> {
  preflight();
  // scrcpy backend: resolve (and, if needed, download + verify) the server jar
  // before we start serving, so the first stream doesn't stall on a fetch.
  if (config.CAPTURE === 'scrcpy') {
    try {
      config.SCRCPY_JAR = await ensureScrcpyJar();
    } catch (e) {
      fail(
        `scrcpy server jar unavailable: ${(e as Error).message}`,
        'Download scrcpy-server-v4.1 from https://github.com/Genymobile/scrcpy/releases/tag/v4.1 ' +
          'and pass --scrcpy-server <path>, or use the default --capture screenrecord.',
      );
    }
  }
  ensureAssetsBuilt();
  const server = createHttpServer();
  attachWebSocket(server);
  server.listen(config.PORT, () => {
    const url = `http://localhost:${config.PORT}`;
    log.info(`${url}  (ws on same port) · capture: ${config.CAPTURE}`);
    log.debug(
      `config: port=${config.PORT} capture=${config.CAPTURE} codec=${config.CODEC} ` +
        `scrcpy-control=${config.SCRCPY_CONTROL} headless=${config.HEADLESS} ` +
        `tunnel=${config.TUNNEL}${config.TUNNEL ? `(control=${config.TUNNEL_CONTROL})` : ''} ` +
        `target=${config.TARGET || '-'}`,
    );
    const running = listDevices();
    log.info(
      running.length
        ? `devices: ${running.map((d) => `${d.avd}(${d.serial})`).join(', ')}`
        : 'no devices yet — start one from the sidebar',
    );
    if (config.TARGET) {
      log.info(`target: ${config.TARGET}${targetSerial() ? ` (${targetSerial()})` : ''}`);
    }
    bootTargetIfNeeded();
    // In secure (tunnel) mode the local browser needs the token to control.
    const localUrl = config.SECURE ? `${url}?k=${config.CONTROL_TOKEN}` : url;
    if (config.SECURE) log.info(`local control link: ${localUrl}`);
    if (config.TUNNEL) void startTunnel(config.PORT);
    // Headless normally skips the local browser — but with a tunnel active we
    // still open the local preview so the operator can watch what they're sharing.
    if (config.HEADLESS && !config.TUNNEL) log.info('headless — not opening browser');
    else openBrowser(localUrl);
  });
}

match(config.mode)
  .with('help', () => {
    printHelp();
    process.exit(0);
  })
  .with('list', () => {
    requireAdb();
    cmdListStreams();
    process.exit(0);
  })
  .with('kill', () => {
    requireAdb();
    cmdKill(config.KILL); // exits
  })
  .with('log', () => {
    requireAdb();
    const serial = resolveSerial(null) || listDevices()[0]?.serial || '';
    if (!serial) fail('no running device to log.', 'Start an emulator, or pass an emulator name/serial.');
    cmdLog(serial); // runs until interrupted
  })
  .with('serve', () => void serve())
  .exhaustive();
