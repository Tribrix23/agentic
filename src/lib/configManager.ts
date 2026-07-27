// ============================================================================
// Configuration Management System
// ============================================================================

export interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  api: {
    endpoint: string;
    timeout: number;
    maxRetries: number;
    retryDelay: number;
  };
  agent: {
    maxIterations: number;
    temperature: number;
    topP: number;
    enableThinking: boolean;
    reasoningBudget?: number;
  };
  cache: {
    enabled: boolean;
    maxSize: number;
    defaultTTL: number;
  };
  parallel: {
    enabled: boolean;
    maxConcurrency: number;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    enableConsole: boolean;
    enableFile: boolean;
  };
  features: {
    experimental: boolean;
    betaFeatures: boolean;
    [key: string]: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  environment: 'development',
  api: {
    endpoint: 'https://quantix.api.devctr.com/api/dispatcher',
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  agent: {
    maxIterations: 10,
    temperature: 0.7,
    topP: 0.95,
    enableThinking: true,
  },
  cache: {
    enabled: true,
    maxSize: 500,
    defaultTTL: 10 * 60 * 1000,
  },
  parallel: {
    enabled: true,
    maxConcurrency: 4,
  },
  logging: {
    level: 'info',
    enableConsole: true,
    enableFile: true,
  },
  features: {
    experimental: false,
    betaFeatures: false,
  },
};

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;
  private configPath: string;

  private constructor() {
    this.configPath = 'quantix_config';
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  private loadConfig(): AppConfig {
    try {
      const saved = localStorage.getItem(this.configPath);
      if (saved) {
        const parsed = JSON.parse(saved);
        return this.validateConfig(parsed);
      }
    } catch (e) {
      console.error('Failed to load config, using defaults:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  private validateConfig(config: any): AppConfig {
    const validated: Partial<AppConfig> = {};

    // Validate environment
    if (['development', 'staging', 'production'].includes(config.environment)) {
      validated.environment = config.environment;
    } else {
      validated.environment = DEFAULT_CONFIG.environment;
    }

    // Validate API config
    if (config.api && typeof config.api === 'object') {
      validated.api = {
        endpoint: config.api.endpoint || DEFAULT_CONFIG.api.endpoint,
        timeout: this.validateNumber(config.api.timeout, DEFAULT_CONFIG.api.timeout, 1000, 120000),
        maxRetries: this.validateNumber(config.api.maxRetries, DEFAULT_CONFIG.api.maxRetries, 0, 10),
        retryDelay: this.validateNumber(config.api.retryDelay, DEFAULT_CONFIG.api.retryDelay, 100, 10000),
      };
    } else {
      validated.api = { ...DEFAULT_CONFIG.api };
    }

    // Validate agent config
    if (config.agent && typeof config.agent === 'object') {
      validated.agent = {
        maxIterations: this.validateNumber(config.agent.maxIterations, DEFAULT_CONFIG.agent.maxIterations, 1, 100),
        temperature: this.validateNumber(config.agent.temperature, DEFAULT_CONFIG.agent.temperature, 0, 2),
        topP: this.validateNumber(config.agent.topP, DEFAULT_CONFIG.agent.topP, 0, 1),
        enableThinking: typeof config.agent.enableThinking === 'boolean' ? config.agent.enableThinking : DEFAULT_CONFIG.agent.enableThinking,
        reasoningBudget: config.agent.reasoningBudget,
      };
    } else {
      validated.agent = { ...DEFAULT_CONFIG.agent };
    }

    // Validate cache config
    if (config.cache && typeof config.cache === 'object') {
      validated.cache = {
        enabled: typeof config.cache.enabled === 'boolean' ? config.cache.enabled : DEFAULT_CONFIG.cache.enabled,
        maxSize: this.validateNumber(config.cache.maxSize, DEFAULT_CONFIG.cache.maxSize, 10, 10000),
        defaultTTL: this.validateNumber(config.cache.defaultTTL, DEFAULT_CONFIG.cache.defaultTTL, 1000, 3600000),
      };
    } else {
      validated.cache = { ...DEFAULT_CONFIG.cache };
    }

    // Validate parallel config
    if (config.parallel && typeof config.parallel === 'object') {
      validated.parallel = {
        enabled: typeof config.parallel.enabled === 'boolean' ? config.parallel.enabled : DEFAULT_CONFIG.parallel.enabled,
        maxConcurrency: this.validateNumber(config.parallel.maxConcurrency, DEFAULT_CONFIG.parallel.maxConcurrency, 1, 16),
      };
    } else {
      validated.parallel = { ...DEFAULT_CONFIG.parallel };
    }

    // Validate logging config
    if (config.logging && typeof config.logging === 'object') {
      validated.logging = {
        level: ['debug', 'info', 'warn', 'error'].includes(config.logging.level) 
          ? config.logging.level 
          : DEFAULT_CONFIG.logging.level,
        enableConsole: typeof config.logging.enableConsole === 'boolean' ? config.logging.enableConsole : DEFAULT_CONFIG.logging.enableConsole,
        enableFile: typeof config.logging.enableFile === 'boolean' ? config.logging.enableFile : DEFAULT_CONFIG.logging.enableFile,
      };
    } else {
      validated.logging = { ...DEFAULT_CONFIG.logging };
    }

    // Validate features
    if (config.features && typeof config.features === 'object') {
      validated.features = {
        experimental: typeof config.features.experimental === 'boolean' ? config.features.experimental : DEFAULT_CONFIG.features.experimental,
        betaFeatures: typeof config.features.betaFeatures === 'boolean' ? config.features.betaFeatures : DEFAULT_CONFIG.features.betaFeatures,
        ...config.features,
      };
    } else {
      validated.features = { ...DEFAULT_CONFIG.features };
    }

    return { ...DEFAULT_CONFIG, ...validated } as AppConfig;
  }

  private validateNumber(value: any, defaultValue: number, min: number, max: number): number {
    const num = typeof value === 'number' ? value : defaultValue;
    return Math.max(min, Math.min(max, num));
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public updateConfig(updates: Partial<AppConfig>): void {
    this.config = this.validateConfig({ ...this.config, ...updates });
    this.saveConfig();
    this.notifyConfigChange();
  }

  public setEnvironment(env: 'development' | 'staging' | 'production'): void {
    const envConfigs: Record<string, Partial<AppConfig>> = {
      development: {
        environment: 'development',
        logging: { level: 'debug', enableConsole: true, enableFile: true },
        features: { experimental: true, betaFeatures: true },
      },
      staging: {
        environment: 'staging',
        logging: { level: 'info', enableConsole: true, enableFile: true },
        features: { experimental: false, betaFeatures: true },
      },
      production: {
        environment: 'production',
        logging: { level: 'warn', enableConsole: false, enableFile: true },
        features: { experimental: false, betaFeatures: false },
      },
    };

    this.updateConfig(envConfigs[env] || envConfigs.development);
  }

  public enableFeature(featureName: string): void {
    this.config.features[featureName] = true;
    this.saveConfig();
    this.notifyConfigChange();
  }

  public disableFeature(featureName: string): void {
    this.config.features[featureName] = false;
    this.saveConfig();
    this.notifyConfigChange();
  }

  public isFeatureEnabled(featureName: string): boolean {
    return this.config.features[featureName] === true;
  }

  private saveConfig(): void {
    try {
      localStorage.setItem(this.configPath, JSON.stringify(this.config));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  }

  private notifyConfigChange(): void {
    window.dispatchEvent(new CustomEvent('config-changed', { detail: this.config }));
  }

  public resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
    this.notifyConfigChange();
  }

  public exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  public importConfig(configJson: string): boolean {
    try {
      const parsed = JSON.parse(configJson);
      this.config = this.validateConfig(parsed);
      this.saveConfig();
      this.notifyConfigChange();
      return true;
    } catch (e) {
      console.error('Failed to import config:', e);
      return false;
    }
  }

  public getConfigSchema(): any {
    return {
      type: 'object',
      properties: {
        environment: {
          type: 'string',
          enum: ['development', 'staging', 'production'],
          default: 'development',
        },
        api: {
          type: 'object',
          properties: {
            endpoint: { type: 'string', format: 'uri' },
            timeout: { type: 'number', minimum: 1000, maximum: 120000 },
            maxRetries: { type: 'number', minimum: 0, maximum: 10 },
            retryDelay: { type: 'number', minimum: 100, maximum: 10000 },
          },
        },
        agent: {
          type: 'object',
          properties: {
            maxIterations: { type: 'number', minimum: 1, maximum: 100 },
            temperature: { type: 'number', minimum: 0, maximum: 2 },
            topP: { type: 'number', minimum: 0, maximum: 1 },
            enableThinking: { type: 'boolean' },
            reasoningBudget: { type: 'number' },
          },
        },
        cache: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            maxSize: { type: 'number', minimum: 10, maximum: 10000 },
            defaultTTL: { type: 'number', minimum: 1000, maximum: 3600000 },
          },
        },
        parallel: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            maxConcurrency: { type: 'number', minimum: 1, maximum: 16 },
          },
        },
        logging: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
            enableConsole: { type: 'boolean' },
            enableFile: { type: 'boolean' },
          },
        },
        features: {
          type: 'object',
          additionalProperties: { type: 'boolean' },
        },
      },
    };
  }
}

export const configManager = ConfigManager.getInstance();
