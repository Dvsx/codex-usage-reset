import { EventEmitter } from "node:events";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { TrackerState } from "../shared/types";
import { resolveTrackerScript } from "./runtime-paths";

const BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

export class WindowTracker extends EventEmitter {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private restartAttempt = 0;
  private stopped = false;

  start(): void {
    this.spawnTracker();
  }

  stop(): void {
    this.stopped = true;
    const child = this.child;
    this.child = null;
    if (child && !child.killed) child.kill();
  }

  private spawnTracker(): void {
    if (this.stopped || this.child) return;
    const child = spawn(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        resolveTrackerScript(),
        "-ParentPid",
        String(process.pid)
      ],
      { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }
    );
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const state = JSON.parse(line) as TrackerState;
        this.restartAttempt = 0;
        this.emit("state", state);
      } catch {
        // Ignore non-protocol output from PowerShell.
      }
    });
    createInterface({ input: child.stderr }).on("line", (line) => {
      if (process.env.CODEX_USAGE_DEBUG) console.warn(`[window-tracker] ${line}`);
    });
    const restart = (): void => {
      if (this.child !== child) return;
      this.child = null;
      if (this.stopped) return;
      const delay = BACKOFF_MS[Math.min(this.restartAttempt, BACKOFF_MS.length - 1)] ?? 30_000;
      this.restartAttempt += 1;
      setTimeout(() => this.spawnTracker(), delay);
    };
    child.once("error", restart);
    child.once("exit", restart);
  }
}
