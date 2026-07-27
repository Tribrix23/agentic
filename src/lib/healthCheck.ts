// ============================================================================
// Health Check System
// ============================================================================

import { logger } from './logger';
import { metrics } from './metrics';
import { configManager } from './configManager';
import { toolCache } from './cache';
import { database } from './database';

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
  timestamp: number;
  uptime: number;
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration?: number;
  metadata?: Record<string, any>;
}

export class HealthChecker {
  private static instance: HealthChecker;
  private startTime: number;
  private checkHistory: HealthCheckResult[] = [];
  private maxHistory = 100;

  private constructor() {
    this.startTime = Date.now();
  }

  public static getInstance(): HealthChecker {
    if (!HealthChecker.instance) {
      HealthChecker.instance = new HealthChecker();
    }
    return HealthChecker.instance;
  }

  public async runHealthChecks(): Promise<HealthCheckResult> {
    const checks: HealthCheck[] = [];
    const startTime = Date.now();

    // Check 1: Memory usage
    checks.push(await this.checkMemory());

    // Check 2: Cache health
    checks.push(await this.checkCache());

    // Check 3: Database health
    checks.push(await this.checkDatabase());

    // Check 4: Configuration health
    checks.push(await this.checkConfiguration());

    // Check 5: Metrics health
    checks.push(await this.checkMetrics());

    // Check 6: Storage health
    checks.push(await this.checkStorage());

    // Determine overall status
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warningChecks = checks.filter(c => c.status === 'warn');

    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (failedChecks.length > 0) {
      status = 'unhealthy';
    } else if (warningChecks.length > 0) {
      status = 'degraded';
    } else {
      status = 'healthy';
    }

    const result: HealthCheckResult = {
      status,
      checks,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
    };

    // Store in history
    this.checkHistory.push(result);
    if (this.checkHistory.length > this.maxHistory) {
      this.checkHistory.shift();
    }

    // Log and record metrics
    logger.info('Health check completed', { 
      status, 
      failed: failedChecks.length, 
      warnings: warningChecks.length 
    });
    metrics.increment('health_checks_run');
    metrics.increment(`health_check_status_${status}`);

    return result;
  }

  private async checkMemory(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Estimate memory usage (browser environment)
      const memoryInfo = this.getMemoryInfo();
      const memoryUsagePercent = (memoryInfo.used / memoryInfo.limit) * 100;

      let status: 'pass' | 'fail' | 'warn';
      let message: string;

      if (memoryUsagePercent > 90) {
        status = 'fail';
        message = `Critical memory usage: ${memoryUsagePercent.toFixed(1)}%`;
      } else if (memoryUsagePercent > 70) {
        status = 'warn';
        message = `High memory usage: ${memoryUsagePercent.toFixed(1)}%`;
      } else {
        status = 'pass';
        message = `Memory usage normal: ${memoryUsagePercent.toFixed(1)}%`;
      }

      return {
        name: 'memory',
        status,
        message,
        duration: Date.now() - startTime,
        metadata: memoryInfo,
      };
    } catch (error) {
      return {
        name: 'memory',
        status: 'fail',
        message: `Memory check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private getMemoryInfo(): { used: number; limit: number; available: number } {
    // Approximate memory info for browser environment
    if ((performance as any).memory) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        limit: memory.jsHeapSizeLimit,
        available: memory.jsHeapSizeLimit - memory.usedJSHeapSize,
      };
    }
    
    // Fallback estimates
    return {
      used: 50 * 1024 * 1024, // 50MB estimate
      limit: 500 * 1024 * 1024, // 500MB estimate
      available: 450 * 1024 * 1024,
    };
  }

  private async checkCache(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const stats = toolCache.getStats();
      const hitRate = stats.hitRate;

      let status: 'pass' | 'fail' | 'warn';
      let message: string;

      if (stats.size > stats.maxSize * 0.9) {
        status = 'warn';
        message = `Cache near capacity: ${stats.size}/${stats.maxSize}`;
      } else if (hitRate < 0.3 && stats.hits + stats.misses > 10) {
        status = 'warn';
        message = `Low cache hit rate: ${(hitRate * 100).toFixed(1)}%`;
      } else {
        status = 'pass';
        message = `Cache healthy: ${(hitRate * 100).toFixed(1)}% hit rate`;
      }

      return {
        name: 'cache',
        status,
        message,
        duration: Date.now() - startTime,
        metadata: stats,
      };
    } catch (error) {
      return {
        name: 'cache',
        status: 'fail',
        message: `Cache check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Try to execute a simple query
      await database.execute('SELECT 1');
      
      return {
        name: 'database',
        status: 'pass',
        message: 'Database connection healthy',
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        name: 'database',
        status: 'fail',
        message: `Database check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkConfiguration(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const config = configManager.getConfig();
      
      // Validate required config fields
      const missingFields: string[] = [];
      if (!config.api) missingFields.push('api');
      if (!config.agent) missingFields.push('agent');
      if (!config.cache) missingFields.push('cache');
      
      if (missingFields.length > 0) {
        return {
          name: 'configuration',
          status: 'fail',
          message: `Missing required config fields: ${missingFields.join(', ')}`,
          duration: Date.now() - startTime,
        };
      }

      return {
        name: 'configuration',
        status: 'pass',
        message: 'Configuration valid',
        duration: Date.now() - startTime,
        metadata: { environment: config.environment },
      };
    } catch (error) {
      return {
        name: 'configuration',
        status: 'fail',
        message: `Configuration check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkMetrics(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      const allMetrics = metrics.getAllMetrics();
      const metricCount = allMetrics.size;

      let status: 'pass' | 'fail' | 'warn';
      let message: string;

      if (metricCount === 0) {
        status = 'warn';
        message = 'No metrics collected yet';
      } else {
        status = 'pass';
        message = `Metrics collection active: ${metricCount} metric types`;
      }

      return {
        name: 'metrics',
        status,
        message,
        duration: Date.now() - startTime,
        metadata: { metricCount },
      };
    } catch (error) {
      return {
        name: 'metrics',
        status: 'fail',
        message: `Metrics check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private async checkStorage(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check localStorage availability
      const testKey = 'health_check_test';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);

      // Estimate storage usage
      let totalSize = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          totalSize += localStorage.getItem(key)?.length || 0;
        }
      }

      const sizeInMB = totalSize / (1024 * 1024);
      let status: 'pass' | 'fail' | 'warn';
      let message: string;

      if (sizeInMB > 4) {
        status = 'warn';
        message = `High storage usage: ${sizeInMB.toFixed(2)}MB`;
      } else {
        status = 'pass';
        message = `Storage usage normal: ${sizeInMB.toFixed(2)}MB`;
      }

      return {
        name: 'storage',
        status,
        message,
        duration: Date.now() - startTime,
        metadata: { sizeInMB },
      };
    } catch (error) {
      return {
        name: 'storage',
        status: 'fail',
        message: `Storage check failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      };
    }
  }

  public getHealthHistory(): HealthCheckResult[] {
    return [...this.checkHistory];
  }

  public getLatestHealthCheck(): HealthCheckResult | null {
    if (this.checkHistory.length === 0) return null;
    return this.checkHistory[this.checkHistory.length - 1];
  }

  public clearHistory(): void {
    this.checkHistory = [];
    logger.info('Health check history cleared');
  }

  public getUptime(): number {
    return Date.now() - this.startTime;
  }

  public async checkSpecific(checkName: string): Promise<HealthCheck> {
    switch (checkName) {
      case 'memory':
        return await this.checkMemory();
      case 'cache':
        return await this.checkCache();
      case 'database':
        return await this.checkDatabase();
      case 'configuration':
        return await this.checkConfiguration();
      case 'metrics':
        return await this.checkMetrics();
      case 'storage':
        return await this.checkStorage();
      default:
        return {
          name: checkName,
          status: 'fail',
          message: `Unknown health check: ${checkName}`,
        };
    }
  }
}

export const healthChecker = HealthChecker.getInstance();

// Convenience function to run health checks
export async function checkHealth(): Promise<HealthCheckResult> {
  return await healthChecker.runHealthChecks();
}

// Health check decorator for automatic monitoring
export function withHealthCheck(checkName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const healthCheck = await healthChecker.checkSpecific(checkName);
      
      if (healthCheck.status === 'fail') {
        logger.warn(`Health check failed before ${propertyKey}`, { healthCheck });
        throw new Error(`Health check failed: ${healthCheck.message}`);
      }

      return await originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
