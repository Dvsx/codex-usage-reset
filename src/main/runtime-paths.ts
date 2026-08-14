import { existsSync, readdirSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { app } from "electron";

function findFile(root: string, name: string, depth = 0): string | null {
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

export function resolveCodexExecutable(): string {
  if (app.isPackaged) {
    const packaged = join(process.resourcesPath, "codex-runtime", "codex.exe");
    if (existsSync(packaged)) return packaged;
    throw new Error(`codex_runtime_missing:${packaged}`);
  }

  const roots: string[] = [];
  for (const projectRoot of [process.cwd(), app.getAppPath()]) {
    const direct = resolve(projectRoot, "node_modules", "@openai", "codex-win32-x64");
    roots.push(direct);
    const codexLink = resolve(projectRoot, "node_modules", "@openai", "codex");
    if (existsSync(codexLink)) {
      roots.push(join(dirname(realpathSync(codexLink)), "codex-win32-x64"));
    }
  }
  for (const root of roots) {
    const executable = findFile(root, "codex.exe");
    if (executable) return executable;
  }
  throw new Error("codex_runtime_missing:run_pnpm_install");
}

export function resolveTrackerScript(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "window-tracker.ps1")
    : resolve(app.getAppPath(), "resources", "window-tracker.ps1");
}

export function portableExecutablePath(): string {
  return process.env.PORTABLE_EXECUTABLE_FILE || app.getPath("exe");
}

export function runtimeDirectoryOf(executable: string): string {
  return dirname(executable);
}
