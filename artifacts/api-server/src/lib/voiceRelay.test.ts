/**
 * Tests for voiceRelay backpressure logic.
 *
 * We mock child_process.spawn so aplay never actually runs, giving us full
 * control of the stdin writable stream so we can simulate back-pressure
 * (writableNeedDrain = true) and drain events.
 */

import { EventEmitter } from "events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Fake stdin – a minimal writable-stream-like object we fully control.
// ---------------------------------------------------------------------------
class FakeStdin extends EventEmitter {
  destroyed = false;
  writableNeedDrain = false;
  written: Buffer[] = [];

  write(chunk: Buffer): boolean {
    this.written.push(chunk);
    return !this.writableNeedDrain;
  }

  end() {
    this.destroyed = true;
  }
}

// Fake process returned by mocked spawn
class FakeProcess extends EventEmitter {
  stdin: FakeStdin;
  stderr: EventEmitter;

  constructor(stdin: FakeStdin) {
    super();
    this.stdin = stdin;
    this.stderr = new EventEmitter();
  }
}

// We need a reference to the current fake stdin so tests can manipulate it.
let currentStdin: FakeStdin;
let currentProcess: FakeProcess;

// ---------------------------------------------------------------------------
// Mock child_process BEFORE importing the module under test so the module
// picks up the mock when it first calls spawn.
// ---------------------------------------------------------------------------
vi.mock("child_process", () => ({
  spawn: vi.fn(() => {
    currentStdin = new FakeStdin();
    currentProcess = new FakeProcess(currentStdin);
    return currentProcess;
  }),
}));

// Mock logger to silence noise during tests.
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
  writeChunk,
  getVoiceRelayStats,
  resetVoiceRelayStats,
  resolveRingCapacity,
} from "./voiceRelay.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Kick aplay into existence by writing one chunk, then wait a tick. */
async function bootAplay(): Promise<void> {
  // First write when aplayProcess is null triggers startAplay() internally.
  // That chunk is dropped because aplay "just started", but the process is
  // now set up and subsequent writes go through normally.
  writeChunk(Buffer.alloc(4));
  await tick();
}

function tick(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("voiceRelay backpressure", () => {
  beforeEach(async () => {
    // Reset module-level counters first (also clears the ring buffer).
    resetVoiceRelayStats();

    // If a previous test left an aplay process running, emit an exit event so
    // the module resets its internal aplayProcess reference to null.  This
    // ensures bootAplay() will call spawn() and give us a fresh FakeProcess.
    if (currentProcess) {
      currentProcess.emit("exit", 0);
      await tick();
    }

    // Now boot a fresh aplay process for this test.
    await bootAplay();

    // Reset stats again so the one "boot" chunk written above is excluded
    // from test-body assertions, and clear the stdin write log.
    resetVoiceRelayStats();
    currentStdin.written = [];
  });

  it("writes chunks directly when stdin is not draining", () => {
    currentStdin.writableNeedDrain = false;

    const chunk = Buffer.from([1, 2, 3, 4]);
    writeChunk(chunk);

    expect(currentStdin.written).toHaveLength(1);
    expect(currentStdin.written[0]).toEqual(chunk);
  });

  it("buffers chunks in the ring when stdin needs draining", () => {
    currentStdin.writableNeedDrain = true;

    const chunk1 = Buffer.from([1, 2]);
    const chunk2 = Buffer.from([3, 4]);
    writeChunk(chunk1);
    writeChunk(chunk2);

    // Nothing written to stdin directly while it is draining.
    expect(currentStdin.written).toHaveLength(0);

    const stats = getVoiceRelayStats();
    expect(stats.bufferedChunks).toBe(2);
    expect(stats.droppedFrames).toBe(0);
  });

  it("drops chunks and increments droppedFrames when ring buffer is full", () => {
    currentStdin.writableNeedDrain = true;

    // Fill the ring to capacity (100 chunks).
    for (let i = 0; i < 100; i++) {
      writeChunk(Buffer.alloc(4));
    }

    const statsBefore = getVoiceRelayStats();
    expect(statsBefore.bufferedChunks).toBe(100);
    expect(statsBefore.droppedFrames).toBe(0);

    // Next chunk must be dropped.
    writeChunk(Buffer.alloc(4));

    const statsAfter = getVoiceRelayStats();
    expect(statsAfter.bufferedChunks).toBe(100); // ring unchanged
    expect(statsAfter.droppedFrames).toBe(1);
  });

  it("flushes buffered chunks to stdin when drain fires", async () => {
    currentStdin.writableNeedDrain = true;

    const chunk1 = Buffer.from([0x01]);
    const chunk2 = Buffer.from([0x02]);
    writeChunk(chunk1);
    writeChunk(chunk2);

    expect(getVoiceRelayStats().bufferedChunks).toBe(2);
    expect(currentStdin.written).toHaveLength(0);

    // Simulate the OS pipe draining.
    currentStdin.writableNeedDrain = false;
    currentStdin.emit("drain");
    await tick();

    // All buffered chunks should now have been written to stdin.
    expect(currentStdin.written).toHaveLength(2);
    expect(currentStdin.written[0]).toEqual(chunk1);
    expect(currentStdin.written[1]).toEqual(chunk2);
    expect(getVoiceRelayStats().bufferedChunks).toBe(0);
  });

  it("ring buffer does not grow beyond RING_CAPACITY (no memory leak)", () => {
    currentStdin.writableNeedDrain = true;

    // Send 200 chunks – only 100 fit in the ring, rest are dropped.
    for (let i = 0; i < 200; i++) {
      writeChunk(Buffer.alloc(4));
    }

    const stats = getVoiceRelayStats();
    expect(stats.bufferedChunks).toBeLessThanOrEqual(100);
    expect(stats.droppedFrames).toBeGreaterThanOrEqual(100);
    // receivedFrames should equal total sent (200 + 1 boot chunk already reset)
    expect(stats.receivedFrames).toBe(200);
  });

  it("getVoiceRelayStats reflects received vs dropped accurately", () => {
    currentStdin.writableNeedDrain = false;

    writeChunk(Buffer.alloc(4)); // written directly
    writeChunk(Buffer.alloc(4)); // written directly

    currentStdin.writableNeedDrain = true;
    writeChunk(Buffer.alloc(4)); // buffered, not dropped

    const stats = getVoiceRelayStats();
    // 2 direct + 1 buffered = 3 received, 0 dropped
    expect(stats.receivedFrames).toBe(3);
    expect(stats.droppedFrames).toBe(0);
    expect(stats.bufferedChunks).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// VOICE_RING_CAPACITY env var — resolveRingCapacity() unit tests
// ---------------------------------------------------------------------------

describe("resolveRingCapacity", () => {
  afterEach(() => {
    delete process.env["VOICE_RING_CAPACITY"];
    vi.clearAllMocks();
  });

  it("returns 100 when VOICE_RING_CAPACITY is not set", () => {
    delete process.env["VOICE_RING_CAPACITY"];
    expect(resolveRingCapacity()).toBe(100);
  });

  it("returns 100 when VOICE_RING_CAPACITY is an empty string", () => {
    process.env["VOICE_RING_CAPACITY"] = "";
    expect(resolveRingCapacity()).toBe(100);
  });

  it("returns the parsed value for a valid in-range integer", () => {
    process.env["VOICE_RING_CAPACITY"] = "250";
    expect(resolveRingCapacity()).toBe(250);
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("accepts boundary values 10 and 1000 without a warning", () => {
    process.env["VOICE_RING_CAPACITY"] = "10";
    expect(resolveRingCapacity()).toBe(10);
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);

    vi.clearAllMocks();

    process.env["VOICE_RING_CAPACITY"] = "1000";
    expect(resolveRingCapacity()).toBe(1000);
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("returns 100 and warns for a non-integer string", () => {
    process.env["VOICE_RING_CAPACITY"] = "abc";
    expect(resolveRingCapacity()).toBe(100);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("returns 100 and warns for a partially-numeric string like '100abc'", () => {
    process.env["VOICE_RING_CAPACITY"] = "100abc";
    expect(resolveRingCapacity()).toBe(100);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("uses the value but warns when below the recommended minimum (< 10)", () => {
    process.env["VOICE_RING_CAPACITY"] = "5";
    expect(resolveRingCapacity()).toBe(5);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("uses the value but warns when above the recommended maximum (> 1000)", () => {
    process.env["VOICE_RING_CAPACITY"] = "2000";
    expect(resolveRingCapacity()).toBe(2000);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
