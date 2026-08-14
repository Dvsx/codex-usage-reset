import { app } from "electron";
import { join } from "node:path";
import type { CompanionSettings } from "../shared/types";
import { readJsonFile, writeJsonFile } from "./json-store";
import { portableExecutablePath } from "./runtime-paths";

const DEFAULT_SETTINGS: CompanionSettings = { autoStart: false, launchMinimized: false, onboardingComplete: false };
export type SettingsPatch = Partial<CompanionSettings>;

export class SettingsStore {
  private settings: CompanionSettings = { ...DEFAULT_SETTINGS };
  private readonly path = join(app.getPath("userData"), "settings.json");
  async load(): Promise<CompanionSettings> {
    const saved = await readJsonFile<Partial<CompanionSettings>>(this.path);
    this.settings = {
      autoStart: typeof saved?.autoStart === "boolean" ? saved.autoStart : false,
      launchMinimized: typeof saved?.launchMinimized === "boolean" ? saved.launchMinimized : false,
      onboardingComplete: typeof saved?.onboardingComplete === "boolean" ? saved.onboardingComplete : false
    };
    if (this.settings.autoStart) this.applyLoginItem(true);
    return this.get();
  }
  get(): CompanionSettings { return structuredClone(this.settings); }
  async setAutoStart(enabled: boolean): Promise<CompanionSettings> { return this.update({ autoStart: enabled }); }
  async update(patch: SettingsPatch): Promise<CompanionSettings> {
    const next = this.get();
    if (typeof patch.autoStart === "boolean") next.autoStart = patch.autoStart;
    if (typeof patch.launchMinimized === "boolean") next.launchMinimized = patch.launchMinimized;
    if (typeof patch.onboardingComplete === "boolean") next.onboardingComplete = patch.onboardingComplete;
    this.settings = next;
    this.applyLoginItem(next.autoStart);
    await writeJsonFile(this.path, next);
    return this.get();
  }
  private applyLoginItem(enabled: boolean): void {
    app.setLoginItemSettings({ openAtLogin: enabled, path: portableExecutablePath(), args: ["--autostart"] });
  }
}
