import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timer: NodeJS.Timeout;
}

type RpcEnvelope = {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code?: number; message?: string };
};

export class AppServerRpc extends EventEmitter {
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly executablePath: string) {
    super();
  }

  async start(): Promise<void> {
    if (this.child) return;
    const child = spawn(this.executablePath, ["app-server", "--stdio"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });
    this.child = child;

    createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    createInterface({ input: child.stderr }).on("line", (line) => this.emit("diagnostic", line));
    child.once("error", (error) => this.handleExit(error));
    child.once("exit", (code, signal) => this.handleExit(new Error(`app_server_exit:${code ?? signal ?? "unknown"}`)));

    await this.request("initialize", {
      clientInfo: {
        name: "codex_usage_companion",
        title: "Codex Usage Companion",
        version: "0.1.0"
      },
      capabilities: {
        optOutNotificationMethods: ["thread/started", "item/agentMessage/delta"]
      }
    });
    this.notify("initialized", {});
  }

  request(method: string, params?: unknown, timeoutMs = 15_000): Promise<unknown> {
    if (!this.child?.stdin.writable) return Promise.reject(new Error("app_server_not_running"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`app_server_timeout:${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ method, id, ...(params === undefined ? {} : { params }) });
    });
  }

  notify(method: string, params?: unknown): void {
    this.write({ method, ...(params === undefined ? {} : { params }) });
  }

  stop(): void {
    const child = this.child;
    this.child = null;
    if (child && !child.killed) child.kill();
    this.rejectPending(new Error("app_server_stopped"));
  }

  private write(envelope: RpcEnvelope): void {
    this.child?.stdin.write(`${JSON.stringify(envelope)}\n`);
  }

  private handleLine(line: string): void {
    let envelope: RpcEnvelope;
    try {
      envelope = JSON.parse(line) as RpcEnvelope;
    } catch {
      this.emit("diagnostic", `invalid_json:${line.slice(0, 240)}`);
      return;
    }

    if (typeof envelope.id === "number") {
      const pending = this.pending.get(envelope.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(envelope.id);
      if (envelope.error) {
        pending.reject(new Error(`rpc_error:${envelope.error.code ?? "unknown"}:${envelope.error.message ?? "unknown"}`));
      } else {
        pending.resolve(envelope.result);
      }
      return;
    }

    if (envelope.method) this.emit("notification", envelope.method, envelope.params);
  }

  private handleExit(error: Error): void {
    if (!this.child) return;
    this.child = null;
    this.rejectPending(error);
    this.emit("exit", error);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

