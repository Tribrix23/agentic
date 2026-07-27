// ============================================================================
// Metrics Collection System
// ============================================================================

export interface Metric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
}

export interface CounterMetric extends Metric {
  type: 'counter';
}

export interface GaugeMetric extends Metric {
  type: 'gauge';
}

export interface HistogramMetric extends Metric {
  type: 'histogram';
  buckets?: number[];
}

export interface TimingMetric extends Metric {
  type: 'timing';
  duration: number;
}

export type AnyMetric = CounterMetric | GaugeMetric | HistogramMetric | TimingMetric;

export interface MetricSummary {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, AnyMetric[]> = new Map();
  private maxMetricsPerName = 1000;

  private constructor() {
    this.loadFromStorage();
  }

  public static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  public increment(name: string, value: number = 1, tags?: Record<string, string>): void {
    this.recordMetric({
      type: 'counter',
      name,
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  public gauge(name: string, value: number, tags?: Record<string, string>): void {
    this.recordMetric({
      type: 'gauge',
      name,
      value,
      timestamp: Date.now(),
      tags,
    });
  }

  public histogram(name: string, value: number, buckets?: number[], tags?: Record<string, string>): void {
    this.recordMetric({
      type: 'histogram',
      name,
      value,
      timestamp: Date.now(),
      buckets,
      tags,
    });
  }

  public timing(name: string, duration: number, tags?: Record<string, string>): void {
    this.recordMetric({
      type: 'timing',
      name,
      value: duration,
      duration,
      timestamp: Date.now(),
      tags,
    });
  }

  private recordMetric(metric: AnyMetric): void {
    const metrics = this.metrics.get(metric.name) || [];
    metrics.push(metric);

    // Keep only recent metrics
    if (metrics.length > this.maxMetricsPerName) {
      metrics.shift();
    }

    this.metrics.set(metric.name, metrics);
    this.saveToStorage();
  }

  public getMetrics(name: string): AnyMetric[] {
    return this.metrics.get(name) || [];
  }

  public getAllMetrics(): Map<string, AnyMetric[]> {
    return new Map(this.metrics);
  }

  public getSummary(name: string): MetricSummary | null {
    const metrics = this.metrics.get(name);
    if (!metrics || metrics.length === 0) return null;

    const values = metrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = values[0];
    const max = values[count - 1];

    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    return {
      count,
      sum,
      avg,
      min,
      max,
      p50: values[p50Index],
      p95: values[p95Index],
      p99: values[p99Index],
    };
  }

  public getSummaryByTags(name: string, tags: Record<string, string>): MetricSummary | null {
    const allMetrics = this.metrics.get(name) || [];
    const filtered = allMetrics.filter(m => {
      if (!m.tags) return false;
      return Object.entries(tags).every(([key, value]) => m.tags![key] === value);
    });

    if (filtered.length === 0) return null;

    const values = filtered.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / count;
    const min = values[0];
    const max = values[count - 1];

    const p50Index = Math.floor(count * 0.5);
    const p95Index = Math.floor(count * 0.95);
    const p99Index = Math.floor(count * 0.99);

    return {
      count,
      sum,
      avg,
      min,
      max,
      p50: values[p50Index],
      p95: values[p95Index],
      p99: values[p99Index],
    };
  }

  public clearMetric(name: string): void {
    this.metrics.delete(name);
    this.saveToStorage();
  }

  public clearAll(): void {
    this.metrics.clear();
    this.saveToStorage();
  }

  private saveToStorage(): void {
    try {
      const serialized = Array.from(this.metrics.entries()).map(([name, metrics]) => [
        name,
        metrics.slice(-100), // Only save last 100 metrics per name
      ]);
      localStorage.setItem('quantix_metrics', JSON.stringify(serialized));
    } catch (e) {
      // Ignore storage errors
    }
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem('quantix_metrics');
      if (saved) {
        const parsed = JSON.parse(saved);
        for (const [name, metrics] of parsed) {
          this.metrics.set(name, metrics);
        }
      }
    } catch (e) {
      // Ignore corrupted data
    }
  }

  public exportMetrics(): string {
    const exportData = {
      timestamp: Date.now(),
      metrics: Array.from(this.metrics.entries()).map(([name, metrics]) => ({
        name,
        summary: this.getSummary(name),
        recentMetrics: metrics.slice(-10),
      })),
    };
    return JSON.stringify(exportData, null, 2);
  }
}

// Predefined metric names
export const MetricNames = {
  // Tool execution metrics
  TOOL_EXECUTION_TIME: 'tool_execution_time',
  TOOL_SUCCESS_RATE: 'tool_success_rate',
  TOOL_FAILURE_RATE: 'tool_failure_rate',
  
  // Agent metrics
  AGENT_ITERATION_COUNT: 'agent_iteration_count',
  AGENT_EXECUTION_TIME: 'agent_execution_time',
  AGENT_SUCCESS_RATE: 'agent_success_rate',
  
  // API metrics
  API_REQUEST_TIME: 'api_request_time',
  API_REQUEST_COUNT: 'api_request_count',
  API_ERROR_RATE: 'api_error_rate',
  
  // Cache metrics
  CACHE_HIT_RATE: 'cache_hit_rate',
  CACHE_MISS_RATE: 'cache_miss_rate',
  CACHE_SIZE: 'cache_size',
  
  // System metrics
  MEMORY_USAGE: 'memory_usage',
  CPU_USAGE: 'cpu_usage',
};

export const metrics = MetricsCollector.getInstance();

// Helper function to time operations
export async function timeOperation<T>(
  metricName: string,
  operation: () => Promise<T>,
  tags?: Record<string, string>
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    metrics.timing(metricName, duration, tags);
    metrics.increment(`${metricName}_success`, 1, tags);
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.timing(metricName, duration, tags);
    metrics.increment(`${metricName}_error`, 1, tags);
    throw error;
  }
}

// Helper function to create a timed decorator
export function timed(metricName: string, tags?: Record<string, string>) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      try {
        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;
        metrics.timing(metricName, duration, tags);
        metrics.increment(`${metricName}_success`, 1, tags);
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        metrics.timing(metricName, duration, tags);
        metrics.increment(`${metricName}_error`, 1, tags);
        throw error;
      }
    };

    return descriptor;
  };
}
