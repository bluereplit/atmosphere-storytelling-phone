/**
 * Tests for localMicRelay — covering the pure parseArecordList() parser and
 * the process lifecycle (start / stop / isRunning / getStatus) using a mocked
 * child_process, following the same pattern as voiceRelay.test.ts.
 */

import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fake process building blocks
// ---------------------------------------------------------------------------

/** Minimal readable stream – only needs .pipe() for the stdout→stdin wiring. */
class FakeReadable extends EventEmitter {
  piped: FakeWritable | null = null;

  pipe(dest: FakeWritable): FakeWritable {
    this.piped = dest;
    return dest;
  }
}

/** Minimal writable stream. */
class FakeWritable extends EventEmitter {
  ended = false;
  end() {
    this.ended = true;
  }
}

/** A fake ChildProcess returned by the mocked spawn(). */
class FakeProcess extends EventEmitter {
  stdout: FakeReadable | null;
  stdin: FakeWritable | null;
  stderr: EventEmitter;
  killed = false;
  killSignal: string | undefined;

  constructor(opts: { hasStdout?: boolean; hasStdin?: boolean } = {}) {
    super();
    this.stdout = opts.hasStdout ? new FakeReadable() : null;
    this.stdin = opts.hasStdin ? new FakeWritable() : null;
    this.stderr = new EventEmitter();
  }

  kill(sig?: string): boolean {
    this.killed = true;
    this.killSignal = sig;
    return true;
  }
}

// Tracks the two processes created per start() call.
let fakeArecord: FakeProcess;
let fakeAplay: FakeProcess;
let spawnCallCount = 0;

// ---------------------------------------------------------------------------
// Mock child_process BEFORE importing the module under test.
// ---------------------------------------------------------------------------
vi.mock("child_process", () => ({
  spawn: vi.fn((..._args: unknown[]) => {
    spawnCallCount++;
    if (spawnCallCount % 2 === 1) {
      // Odd calls → arecord (needs stdout)
      fakeArecord = new FakeProcess({ hasStdout: true });
      return fakeArecord;
    } else {
      // Even calls → aplay (needs stdin)
      fakeAplay = new FakeProcess({ hasStdin: true });
      return fakeAplay;
    }
  }),
  execSync: vi.fn(() => Buffer.from("")),
}));

vi.mock("./logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Import AFTER mocks are registered.
import {
  parseArecordList,
  start,
  stop,
  isRunning,
  getStatus,
  setAutoReconnect,
  RECONNECT_MAX_ATTEMPTS,
} from "./localMicRelay.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** Tear down any running relay so each lifecycle test starts from a stopped state. */
async function ensureStopped(): Promise<void> {
  setAutoReconnect(false); // disable reconnect so exit events don't schedule timers
  if (isRunning()) {
    stop();
    fakeArecord?.emit("exit", 0, null);
    fakeAplay?.emit("exit", 0, null);
    await tick();
  }
  setAutoReconnect(true); // re-enable for next test
}

/** Shared helper: expected status shape for the idle/initial state. */
function idleStatus() {
  return {
    running: false,
    device: null,
    error: null,
    reconnecting: false,
    reconnectAttempt: 0,
    reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS,
    autoReconnect: true,
  };
}

// ---------------------------------------------------------------------------
// parseArecordList — pure-function tests
// ---------------------------------------------------------------------------

describe("parseArecordList", () => {
  it("parses a single-word short name", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 0: PCH [HDA Intel PCH], device 0: Analog [ALC887-VD Analog]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "hw:0,0",
      name: "HDA Intel PCH — ALC887-VD Analog",
    });
  });

  it("parses multi-word short names (e.g. Bluetooth SCO, USB Audio)", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 2: Device [Headset Mono], device 0: Bluetooth SCO [Bluetooth SCO]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "hw:2,0",
      name: "Headset Mono — Bluetooth SCO",
    });
  });

  it("parses USB audio devices with multi-word labels", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 3: H570 [Poly H570], device 0: USB Audio [USB Audio]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: "hw:3,0",
      name: "Poly H570 — USB Audio",
    });
  });

  it("parses multiple devices from realistic arecord -l output", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 0: PCH [HDA Intel PCH], device 0: ALC887-VD Analog [ALC887-VD Analog]
card 0: PCH [HDA Intel PCH], device 2: ALC887-VD Alt Analog [ALC887-VD Alt Analog]
card 2: Device [Headset Mono], device 0: Bluetooth SCO [Bluetooth SCO]
card 3: H570 [Poly H570], device 0: USB Audio [USB Audio]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(4);
    expect(devices[0]!.id).toBe("hw:0,0");
    expect(devices[1]!.id).toBe("hw:0,2");
    expect(devices[2]!.id).toBe("hw:2,0");
    expect(devices[2]!.name).toBe("Headset Mono — Bluetooth SCO");
    expect(devices[3]!.id).toBe("hw:3,0");
  });

  it("skips header lines and other non-device lines", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
card 1: Loopback [Loopback], device 0: Loopback PCM [Loopback PCM]
card 1: Loopback [Loopback], device 1: Loopback PCM [Loopback PCM]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(2);
    expect(devices[0]!.id).toBe("hw:1,0");
    expect(devices[1]!.id).toBe("hw:1,1");
  });

  it("returns empty array for empty output", () => {
    expect(parseArecordList("")).toHaveLength(0);
  });

  it("returns empty array when arecord reports no devices", () => {
    const output = `**** List of CAPTURE Hardware Devices ****
arecord: device_list:272: no soundcards found...`;
    expect(parseArecordList(output)).toHaveLength(0);
  });

  it("trims whitespace from names", () => {
    const output = `card 0: PCH  [HDA Intel PCH ], device 0: Analog  [ALC887-VD Analog ]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.name).toBe("HDA Intel PCH — ALC887-VD Analog");
  });

  it("handles high card/device numbers", () => {
    const output = `card 15: HDMI [HDA Intel HDMI], device 7: HDMI 6 [HDMI 6]`;
    const devices = parseArecordList(output);
    expect(devices).toHaveLength(1);
    expect(devices[0]!.id).toBe("hw:15,7");
    expect(devices[0]!.name).toBe("HDA Intel HDMI — HDMI 6");
  });
});

// ---------------------------------------------------------------------------
// Process lifecycle — start / stop / isRunning / getStatus
// ---------------------------------------------------------------------------

describe("localMicRelay lifecycle", () => {
  beforeEach(async () => {
    spawnCallCount = 0;
    vi.clearAllMocks();
    await ensureStopped();
  });

  afterEach(async () => {
    await ensureStopped();
  });

  // --- initial state ---

  it("isRunning() returns false before any start()", () => {
    expect(isRunning()).toBe(false);
  });

  it("getStatus() returns idle state before any start()", () => {
    expect(getStatus()).toMatchObject({ running: false, device: null, error: null, reconnecting: false });
  });

  // --- start() happy path ---

  it("start() spawns arecord and aplay", async () => {
    const { spawn } = await import("child_process");
    start("hw:2,0");
    await tick();

    expect(spawn).toHaveBeenCalledTimes(2);
    const calls = (spawn as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]![0]).toBe("arecord");
    expect(calls[0]![1]).toContain("hw:2,0");
    expect(calls[1]![0]).toBe("aplay");
  });

  it("start() sets isRunning() to true", async () => {
    start("hw:2,0");
    await tick();
    expect(isRunning()).toBe(true);
  });

  it("start() pipes arecord stdout to aplay stdin", async () => {
    start("hw:2,0");
    await tick();
    expect(fakeArecord.stdout!.piped).toBe(fakeAplay.stdin);
  });

  it("getStatus() reports running=true with the active device and reconnect fields", async () => {
    start("hw:2,0");
    await tick();
    expect(getStatus()).toMatchObject({
      running: true,
      device: "hw:2,0",
      error: null,
      reconnecting: false,
      reconnectAttempt: 0,
      reconnectMaxAttempts: RECONNECT_MAX_ATTEMPTS,
    });
  });

  // --- start() idempotency ---

  it("start() is a no-op when called again with the same device", async () => {
    const { spawn } = await import("child_process");
    start("hw:2,0");
    await tick();
    const callsBefore = (spawn as ReturnType<typeof vi.fn>).mock.calls.length;

    start("hw:2,0");
    await tick();

    expect((spawn as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore);
    expect(isRunning()).toBe(true);
  });

  it("start() stops existing capture and restarts for a different device", async () => {
    const { spawn } = await import("child_process");
    start("hw:0,0");
    await tick();
    const firstCallCount = (spawn as ReturnType<typeof vi.fn>).mock.calls.length;

    // Bring processes down so module resets its internal refs.
    fakeArecord.emit("exit", 0, null);
    fakeAplay.emit("exit", 0, null);
    await tick();

    start("hw:1,0");
    await tick();

    expect((spawn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(firstCallCount);
    expect(getStatus().device).toBe("hw:1,0");
  });

  // --- stop() ---

  it("stop() sets isRunning() to false", async () => {
    start("hw:2,0");
    await tick();
    expect(isRunning()).toBe(true);

    stop();
    await tick();

    expect(isRunning()).toBe(false);
  });

  it("stop() sends SIGTERM to both child processes", async () => {
    start("hw:2,0");
    await tick();

    stop();
    await tick();

    expect(fakeArecord.killed).toBe(true);
    expect(fakeAplay.killed).toBe(true);
  });

  it("stop() is safe to call when nothing is running", () => {
    expect(() => stop()).not.toThrow();
  });

  it("getStatus() returns running=false after stop + exit", async () => {
    start("hw:2,0");
    await tick();

    stop();
    fakeArecord.emit("exit", 0, null);
    fakeAplay.emit("exit", 0, null);
    await tick();

    expect(getStatus().running).toBe(false);
  });

  // --- error events ---

  it("arecord ENOENT error stops the relay and sets an error message", async () => {
    start("hw:2,0");
    await tick();

    const err = Object.assign(new Error("spawn arecord ENOENT"), { code: "ENOENT" });
    fakeArecord.emit("error", err);
    await tick();

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.error).toMatch(/arecord not found/);
  });

  it("arecord generic error stops the relay and sets an error message", async () => {
    start("hw:2,0");
    await tick();

    fakeArecord.emit("error", new Error("some unexpected error"));
    await tick();

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.error).toMatch(/arecord error/);
  });

  it("aplay ENOENT error stops the relay and sets an error message", async () => {
    start("hw:2,0");
    await tick();

    const err = Object.assign(new Error("spawn aplay ENOENT"), { code: "ENOENT" });
    fakeAplay.emit("error", err);
    await tick();

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.error).toMatch(/aplay not found/);
  });

  it("aplay generic error stops the relay and sets an error message", async () => {
    start("hw:2,0");
    await tick();

    fakeAplay.emit("error", new Error("broken pipe"));
    await tick();

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.error).toMatch(/aplay error/);
  });

  it("unexpected arecord exit records a lastError message", async () => {
    start("hw:2,0");
    await tick();

    // Disable auto-reconnect so this test doesn't schedule timers.
    setAutoReconnect(false);
    fakeArecord.emit("exit", 1, null);
    await tick();
    setAutoReconnect(true);

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.error).toMatch(/Capture stopped unexpectedly/);
  });

  it("getStatus() preserves the device name after an error", async () => {
    start("hw:3,0");
    await tick();

    const err = Object.assign(new Error("no such file"), { code: "ENOENT" });
    fakeArecord.emit("error", err);
    await tick();

    const s = getStatus();
    expect(s.device).toBe("hw:3,0");
    expect(s.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auto-reconnect behaviour
// ---------------------------------------------------------------------------

/**
 * Microtask yield — works even when fake timers are installed because it uses
 * Promise scheduling (microtask queue) rather than setTimeout/setInterval.
 */
function mt(): Promise<void> {
  return Promise.resolve();
}

describe("localMicRelay auto-reconnect", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    spawnCallCount = 0;
    vi.clearAllMocks();
    // Ensure clean state: disable reconnect, stop, re-enable
    setAutoReconnect(false);
    stop();
    await mt();
    setAutoReconnect(true);
  });

  afterEach(async () => {
    setAutoReconnect(false);
    stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    await mt();
    setAutoReconnect(true);
    await ensureStopped();
  });

  it("schedules a reconnect when capture stops unexpectedly", async () => {
    const { spawn } = await import("child_process");
    start("hw:2,0");
    await mt();
    expect(isRunning()).toBe(true);

    // Simulate unexpected exit — state updates are synchronous
    fakeArecord.emit("exit", 1, null);
    await mt();

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.reconnecting).toBe(true);
    expect(s.reconnectAttempt).toBe(1);

    // Advance past the retry delay only (runOnlyPendingTimers avoids firing
    // the stability timer that _doStart() schedules on a successful spawn).
    const spawnsBefore = (spawn as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.runOnlyPendingTimersAsync();
    await mt();

    expect((spawn as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(spawnsBefore);
    expect(isRunning()).toBe(true);
    expect(getStatus().reconnecting).toBe(false);
  });

  it("increments reconnectAttempt across consecutive spawn failures", async () => {
    start("hw:2,0");
    await mt();

    // First unexpected exit → attempt 1 scheduled
    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnectAttempt).toBe(1);

    // Fire only the retry timer (not the stability timer) → new spawn → immediately dies → attempt 2
    await vi.runOnlyPendingTimersAsync();
    await mt();
    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnectAttempt).toBe(2);

    // Fire again → attempt 3
    await vi.runOnlyPendingTimersAsync();
    await mt();
    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnectAttempt).toBe(3);
  });

  it("stops retrying and shows exhaustion error after max attempts", async () => {
    start("hw:2,0");
    await mt();

    // Sequence: initial failure + RECONNECT_MAX_ATTEMPTS retry failures.
    // Each retry is triggered by advancing only the pending reconnect timer
    // (runOnlyPendingTimersAsync avoids firing the stability timer).
    //
    // After the last retry fails the counter reaches RECONNECT_MAX_ATTEMPTS
    // and the exhaustion branch fires (no further retry scheduled).
    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnectAttempt).toBe(1);

    for (let i = 1; i <= RECONNECT_MAX_ATTEMPTS; i++) {
      await vi.runOnlyPendingTimersAsync(); // fire the pending retry timer
      await mt();
      fakeArecord.emit("exit", 1, null);   // retry spawn immediately dies
      await mt();
    }

    const s = getStatus();
    expect(s.running).toBe(false);
    expect(s.reconnecting).toBe(false);
    expect(s.reconnectAttempt).toBe(0);
    expect(s.error).toMatch(/did not reconnect/);
  });

  it("does not reconnect when auto-reconnect is disabled", async () => {
    setAutoReconnect(false);
    start("hw:2,0");
    await mt();

    fakeArecord.emit("exit", 1, null);
    await mt();

    const s = getStatus();
    expect(s.reconnecting).toBe(false);
    expect(s.reconnectAttempt).toBe(0);
    expect(s.error).toMatch(/Capture stopped unexpectedly/);
  });

  it("cancels a pending retry when setAutoReconnect(false) is called mid-wait", async () => {
    start("hw:2,0");
    await mt();

    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnecting).toBe(true);

    setAutoReconnect(false);
    await mt();

    expect(getStatus().reconnecting).toBe(false);
    expect(getStatus().reconnectAttempt).toBe(0);
  });

  it("stop() cancels a pending retry and resets counters", async () => {
    start("hw:2,0");
    await mt();

    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnecting).toBe(true);

    stop();
    await mt();

    expect(getStatus().reconnecting).toBe(false);
    expect(getStatus().reconnectAttempt).toBe(0);
  });

  it("user-initiated start() resets attempt counter and cancels reconnect", async () => {
    start("hw:2,0");
    await mt();

    // Let first attempt fail
    fakeArecord.emit("exit", 1, null);
    await mt();
    expect(getStatus().reconnectAttempt).toBe(1);

    // User explicitly starts again — counter must reset
    start("hw:2,0");
    await mt();

    expect(getStatus().reconnectAttempt).toBe(0);
    expect(isRunning()).toBe(true);
  });

  it("getStatus() includes reconnectMaxAttempts equal to RECONNECT_MAX_ATTEMPTS", () => {
    expect(getStatus().reconnectMaxAttempts).toBe(RECONNECT_MAX_ATTEMPTS);
  });

  it("getStatus() reflects autoReconnect toggle", () => {
    setAutoReconnect(false);
    expect(getStatus().autoReconnect).toBe(false);
    setAutoReconnect(true);
    expect(getStatus().autoReconnect).toBe(true);
  });
});
