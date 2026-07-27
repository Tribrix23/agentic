// ============================================================================
// Tool Execution Profiling
// ============================================================================

import { logger } from './logger';
import { metrics } from './metrics';

export interface ProfileData {
  toolName: string;
  callCount: number;
  totalDuration: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastExecuted: number;
}

export interface ProfileEntry {
  toolName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  arguments?: Record<string, any>;
  result?: any;
  error?: Error;
}

export class ToolProfiler {
  private static instance: ToolProfiler;
  private profiles: Map<string, ProfileData> = new Map();
  private entries: ProfileEntry[] = [];
  private maxEntries = 1000;
  private enabled = true;

  private constructor() {}

  public static getInstance(): ToolProfiler {
    if (!ToolProfiler.instance) {
      ToolProfiler.instance = new ToolProfiler();
    }
    return ToolProfiler.instance;
  }

  public enable(): void {
    this.enabled = true;
    logger.info('Tool profiler enabled');
  }

  public disable(): void {
    this.enabled = false;
    logger.info('Tool profiler disabled');
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public startProfile(toolName: string, args?: Record<string, any>): string {
    if (!this.enabled) return '';

    const entry: ProfileEntry = {
      toolName,
      startTime: Date.now(),
      success: false,
      arguments: args,
    };

    this.entries.push(entry);
    
    // Keep only recent entries
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return `${entry.toolName}_${entry.startTime}`;
  }

  public endProfile(profileId: string, success: boolean, result?: any, error?: Error): void {
    if (!this.enabled || !profileId) return;

    const entry = this.entries.find(e => `${e.toolName}_${e.startTime}` === profileId);
    if (!entry) return;

    entry.endTime = Date.now();
    entry.duration = entry.endTime - entry.startTime;
    entry.success = success;
    entry.result = result;
    entry.error = error;

    // Update profile data
    this.updateProfile(entry);
    
    // Record metrics
    metrics.timing(`tool_${entry.toolName}_duration`, entry.duration);
    if (success) {
      metrics.increment(`tool_${entry.toolName}_success`);
    } else {
      metrics.increment(`tool_${entry.toolName}_failure`);
    }
  }

  private updateProfile(entry: ProfileEntry): void {
    let profile = this.profiles.get(entry.toolName);
    
    if (!profile) {
      profile = {
        toolName: entry.toolName,
        callCount: 0,
        totalDuration: 0,
        avgDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        lastExecuted: 0,
      };
      this.profiles.set(entry.toolName, profile);
    }

    if (entry.duration === undefined) return;

    profile.callCount++;
    profile.totalDuration += entry.duration;
    profile.avgDuration = profile.totalDuration / profile.callCount;
    profile.minDuration = Math.min(profile.minDuration, entry.duration);
    profile.maxDuration = Math.max(profile.maxDuration, entry.duration);
    
    if (entry.success) {
      profile.successCount++;
    } else {
      profile.failureCount++;
    }
    
    profile.successRate = profile.successCount / profile.callCount;
    profile.lastExecuted = entry.endTime || Date.now();
  }

  public getProfile(toolName: string): ProfileData | null {
    return this.profiles.get(toolName) || null;
  }

  public getAllProfiles(): Map<string, ProfileData> {
    return new Map(this.profiles);
  }

  public getTopSlowTools(limit: number = 10): ProfileData[] {
    return Array.from(this.profiles.values())
      .sort((a, b) => b.avgDuration - a.avgDuration)
      .slice(0, limit);
  }

  public getTopFrequentTools(limit: number = 10): ProfileData[] {
    return Array.from(this.profiles.values())
      .sort((a, b) => b.callCount - a.callCount)
      .slice(0, limit);
  }

  public getLowSuccessRateTools(threshold: number = 0.5): ProfileData[] {
    return Array.from(this.profiles.values())
      .filter(p => p.successRate < threshold)
      .sort((a, b) => a.successRate - b.successRate);
  }

  public getRecentEntries(limit: number = 50): ProfileEntry[] {
    return this.entries.slice(-limit).reverse();
  }

  public getEntriesByTool(toolName: string, limit: number = 50): ProfileEntry[] {
    return this.entries
      .filter(e => e.toolName === toolName)
      .slice(-limit)
      .reverse();
  }

  public getFailedEntries(limit: number = 50): ProfileEntry[] {
    return this.entries
      .filter(e => !e.success)
      .slice(-limit)
      .reverse();
  }

  public clearProfiles(): void {
    this.profiles.clear();
    logger.info('Tool profiles cleared');
  }

  public clearEntries(): void {
    this.entries = [];
    logger.info('Tool profile entries cleared');
  }

  public clearAll(): void {
    this.clearProfiles();
    this.clearEntries();
  }

  public exportProfiles(): string {
    const exportData = {
      timestamp: Date.now(),
      profiles: Array.from(this.profiles.entries()),
      recentEntries: this.entries.slice(-100),
    };
    return JSON.stringify(exportData, null, 2);
  }

  public getSummary(): any {
    const profiles = Array.from(this.profiles.values());
    
    if (profiles.length === 0) {
      return {
        totalTools: 0,
        totalCalls: 0,
        avgDuration: 0,
        overallSuccessRate: 0,
      };
    }

    const totalCalls = profiles.reduce((sum, p) => sum + p.callCount, 0);
    const totalDuration = profiles.reduce((sum, p) => sum + p.totalDuration, 0);
    const totalSuccess = profiles.reduce((sum, p) => sum + p.successCount, 0);

    return {
      totalTools: profiles.length,
      totalCalls,
      avgDuration: totalDuration / totalCalls,
      overallSuccessRate: totalSuccess / totalCalls,
      slowestTool: this.getTopSlowTools(1)[0],
      mostFrequentTool: this.getTopFrequentTools(1)[0],
      leastReliableTool: this.getLowSuccessRateTools(1)[0],
    };
  }
}

export const toolProfiler = ToolProfiler.getInstance();

// Decorator for automatic profiling
export function profileTool(toolName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const name = toolName || propertyKey;

    descriptor.value = async function (...args: any[]) {
      const profileId = toolProfiler.startProfile(name);
      
      try {
        const result = await originalMethod.apply(this, args);
        toolProfiler.endProfile(profileId, true, result);
        return result;
      } catch (error) {
        toolProfiler.endProfile(profileId, false, undefined, error as Error);
        throw error;
      }
    };

    return descriptor;
  };
}

// Higher-order function for profiling async operations
export async function withProfile<T>(
  toolName: string,
  operation: () => Promise<T>,
  args?: Record<string, any>
): Promise<T> {
  const profileId = toolProfiler.startProfile(toolName, args);
  
  try {
    const result = await operation();
    toolProfiler.endProfile(profileId, true, result);
    return result;
  } catch (error) {
    toolProfiler.endProfile(profileId, false, undefined, error as Error);
    throw error;
  }
}
