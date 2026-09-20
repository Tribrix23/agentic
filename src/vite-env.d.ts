/// <reference types="vite/client" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import type { EnvironmentBridgeApi } from './lib/environment/bridge';

declare global {
  interface Window {
    electron: { environment: EnvironmentBridgeApi, printToPdf?: (suggestedName: string) => Promise<boolean>, previewPdf?: () => Promise<boolean> } & Record<string, any>;
  }
}

export {};
