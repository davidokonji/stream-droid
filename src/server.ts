#!/usr/bin/env bun

import { createInterface } from 'node:readline';
import { match } from 'ts-pattern';
import { config, fail } from './config.ts';
import { log } from './log.ts';
import { resolveSerial, targetSerial } from './adb.ts';
import { killEmulators, listDevices, shutdownCandidates } from './emulator.ts';
import { stopTunnel } from './tunnel.ts';
import { createHttpServer } from './httpServer.ts';
import { attachWebSocket } from './wsServer.ts';
import { cmdKill, cmdListStreams, cmdLog, printHelp, requireAdb, startTunnel } from './commands.ts';
import { bootTargetIfNeeded, ensureAssetsBuilt, openBrowser, preflight } from './lifecycle.ts';
import { ensureScrcpyJar } from './capture/scrcpyServer.ts';

async function cleanupOnExit(): Promise<never> {
  stopTunnel();
  const { headless, windowed } = shutdownCandidates();
  killEmulators(headless);

  if (windowed.length) {
    const names = windowed.map((d) => d.avd).join(', ');
    if (await confirmCloseWindowed(names)) killEmulators(windowed);
    else log.info(`leaving ${names} running`);
  }
  process.exit(0);
}

function confirmCloseWindowed(names: string): Promise<boolean> {
  if (config.HEADLESS || !process.stdin.isTTY) {
    log.info(`leaving ${names} running — no terminal to confirm on`);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`\n[stream-droid] close the open emulator ${names}? [y/N] `, (ans) => {
      rl.close();
      resolve(/^\s*y/i.test(ans)); // empty / anything but "y…" = leave it running
    });
  });
}

function confirmPortWalk(busy: number, next: number): Promise<boolean> {
  if (config.HEADLESS || !process.stdin.isTTY) return Promise.resolve(true);
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(`[stream-droid] port ${busy} is in use. Use the next free port (${next})? [Y/n] `, (ans) => {
      rl.close();
      resolve(!/^\s*n/i.test(ans)); // empty / anything but "n…" = yes
    });
  });
}

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
  const startPort = config.PORT;
  const MAX_PORT_TRIES = 20;
  let portTries = 0;
  let mayWalk = false; // set once the user (or a non-TTY default) approves the fallback

  server.on('error', async (e: NodeJS.ErrnoException) => {
    if (e.code !== 'EADDRINUSE') {
      fail(`could not start the server: ${e.message}`, 'Check the port and permissions, or pass --port <n>.');
      return;
    }
    if (portTries >= MAX_PORT_TRIES) {
      fail(`no free port in ${startPort}–${startPort + MAX_PORT_TRIES}`, 'Free one, or pass --port <n>.');
      return;
    }
    if (!mayWalk) {
      const ok = await confirmPortWalk(config.PORT, startPort + portTries + 1);
      if (!ok) fail(`port ${config.PORT} is in use.`, 'Free it, or start with --port <n>.');
      mayWalk = true;
    }
    portTries += 1;
    config.PORT = startPort + portTries; // downstream URLs/tunnel/browser use the bound port
    server.listen(config.PORT, config.HOST);
  });

  server.on('listening', () => {
    attachWebSocket(server);
    const url = `http://localhost:${config.PORT}`;
    // After an interactive port fallback, show where it actually ended up.
    if (config.PORT !== startPort && process.stdin.isTTY && !config.HEADLESS) {
      console.log(`[stream-droid] serving on ${url}`);
    }
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

  process.once('SIGINT', cleanupOnExit);
  process.once('SIGTERM', cleanupOnExit);

  server.listen(startPort, config.HOST);
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
