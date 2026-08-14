import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

function findFile(root, name, depth = 0) {
  if (depth > 8 || !existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const fullPath = join(root, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return fullPath;
    if (entry.isDirectory()) {
      const match = findFile(fullPath, name, depth + 1);
      if (match) return match;
    }
  }
  return null;
}

function resolveExecutable() {
  const staged = resolve("build", "codex-runtime", "codex.exe");
  if (existsSync(staged)) return staged;
  const require = createRequire(import.meta.url);
  const codexRoot = dirname(require.resolve("@openai/codex/package.json"));
  const platformRoot = resolve(codexRoot, "..", "codex-win32-x64");
  const bundled = findFile(platformRoot, "codex.exe");
  if (!bundled) throw new Error("Codex runtime not found; run pnpm install");
  return bundled;
}

const executable = resolveExecutable();
const child = spawn(executable, ["app-server", "--stdio"], {
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"]
});

let nextId = 1;
const pending = new Map();

function request(method, params) {
  const id = nextId++;
  child.stdin.write(`${JSON.stringify({ method, id, ...(params === undefined ? {} : { params }) })}\n`);
  return new Promise((resolvePromise, reject) => {
    pending.set(id, { resolve: resolvePromise, reject });
  });
}

const timeout = setTimeout(() => {
  child.kill();
  throw new Error("App Server integration probe timed out after 20 seconds");
}, 20_000);

createInterface({ input: child.stdout }).on("line", (line) => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  if (typeof message.id !== "number") return;
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.reject(new Error(message.error.message || "RPC error"));
  else entry.resolve(message.result);
});

child.once("error", (error) => {
  clearTimeout(timeout);
  throw error;
});

try {
  await request("initialize", {
    clientInfo: { name: "codex_usage_companion_probe", title: "Codex Usage Companion Probe", version: "0.1.0" }
  });
  child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
  const [accountResult, limitsResult] = await Promise.all([
    request("account/read", { refreshToken: false }),
    request("account/rateLimits/read")
  ]);
  const limits = limitsResult?.rateLimitsByLimitId?.codex ?? limitsResult?.rateLimits ?? {};
  const windowCount = [limits.primary, limits.secondary].filter(Boolean).length;
  console.log(JSON.stringify({
    ok: true,
    accountType: accountResult?.account?.type ?? null,
    planType: accountResult?.account?.planType ?? limits.planType ?? null,
    windowCount,
    resetCreditsAvailable: limitsResult?.rateLimitResetCredits?.availableCount ?? null
  }, null, 2));
} finally {
  clearTimeout(timeout);
  child.kill();
}
