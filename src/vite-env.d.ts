/// <reference types="vite/client" />
/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

import type { EnvironmentBridgeApi } from './lib/environment/bridge';

declare global {
  interface Window {
    electron: { environment: EnvironmentBridgeApi } & Record<string, any>;
  }
}

export {};
