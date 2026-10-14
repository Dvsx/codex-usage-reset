import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn }));
vi.mock("../src/main/runtime-paths", () => ({ resolveTrackerScript: () => "tracker.ps1" }));
import { WindowTracker } from "../src/main/window-tracker";

describe("window tracker recovery", () => {
  let tracker: WindowTracker;
  function setup() {
    vi.useFakeTimers();
    spawn.mockImplementation(() => Object.assign(new EventEmitter(), {
      stdout: new PassThrough(), stderr: new PassThrough(), killed: false, kill: vi.fn()
    }));
    tracker = new WindowTracker();
    tracker.start();
    return spawn.mock.results.at(-1)!.value;
  }
  afterEach(() => { tracker?.stop(); vi.useRealTimers(); vi.clearAllMocks(); });

  it("restarts a live but silent tracker even when Codex was inactive", () => {
    const old = setup();
    const states = vi.fn(); tracker.on("state", states);
    old.stdout.write('{"active":false}\n');
    vi.advanceTimersByTime(16_000);
    expect(old.kill).toHaveBeenCalledOnce();
    expect(spawn).toHaveBeenCalledTimes(2);
    old.stdout.write('{"active":true}\n');
    expect(states).toHaveBeenCalledTimes(1);
  });

  it("keeps a healthy tracker alive with unchanged heartbeat states", () => {
    const child = setup();
    for (let i = 0; i < 30; i++) {
      child.stdout.write('{"active":false}\n');
      vi.advanceTimersByTime(1000);
    }
    expect(spawn).toHaveBeenCalledOnce();
    tracker.stop();
    vi.advanceTimersByTime(30_000);
    expect(spawn).toHaveBeenCalledOnce();
  });
});
