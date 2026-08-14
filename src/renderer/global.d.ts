import type { CompanionApi } from "../shared/types";

declare global {
  interface Window {
    codexUsage: CompanionApi;
  }
}

export {};

