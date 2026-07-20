type MetricLabels = Readonly<Record<string, string>>;

interface NumberSeries {
  name: string;
  labels: MetricLabels;
  value: number;
}

interface ObservationSeries {
  name: string;
  labels: MetricLabels;
  count: number;
  sum: number;
}

interface HistogramSeries extends ObservationSeries {
  buckets: number[];
  bucketCounts: number[];
}

const metricNamePattern = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/u;
const labelNamePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/u;

function normalizedLabels(labels: MetricLabels): MetricLabels {
  return Object.fromEntries(Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)));
}

function seriesKey(name: string, labels: MetricLabels): string {
  return `${name}\u0000${JSON.stringify(normalizedLabels(labels))}`;
}

function escapeLabel(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('\n', '\\n').replaceAll('"', '\\"');
}

function formatLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return '';
  return `{${entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')}}`;
}

function metricLine(name: string, labels: MetricLabels, value: number): string {
  return `${name}${formatLabels(labels)} ${Number.isFinite(value) ? value : 0}`;
}

export class TechnicalMetrics {
  private readonly counters = new Map<string, NumberSeries>();
  private readonly gauges = new Map<string, NumberSeries>();
  private readonly observations = new Map<string, ObservationSeries>();
  private readonly histograms = new Map<string, HistogramSeries>();
  private readonly metricTypes = new Map<string, 'counter' | 'gauge' | 'summary' | 'histogram'>();
  private eventLoopLagSeconds = 0;

  constructor(private readonly collectRuntimeMetrics = false) {
    if (collectRuntimeMetrics) this.scheduleEventLoopLagSample();
  }

  increment(name: string, amount = 1, labels: MetricLabels = {}): void {
    this.assertMetric(name, 'counter', labels);
    const key = seriesKey(name, labels);
    const current = this.counters.get(key);
    this.counters.set(key, { name, labels: normalizedLabels(labels), value: (current?.value ?? 0) + amount });
  }

  setCounter(name: string, value: number, labels: MetricLabels = {}): void {
    this.assertMetric(name, 'counter', labels);
    this.counters.set(seriesKey(name, labels), { name, labels: normalizedLabels(labels), value: Number.isFinite(value) ? value : 0 });
  }

  set(name: string, value: number, labels: MetricLabels = {}): void {
    this.assertMetric(name, 'gauge', labels);
    this.gauges.set(seriesKey(name, labels), { name, labels: normalizedLabels(labels), value: Number.isFinite(value) ? value : 0 });
  }

  addGauge(name: string, amount: number, labels: MetricLabels = {}): void {
    this.assertMetric(name, 'gauge', labels);
    const key = seriesKey(name, labels);
    const current = this.gauges.get(key)?.value ?? 0;
    this.gauges.set(key, {
      name,
      labels: normalizedLabels(labels),
      value: Math.max(0, current + (Number.isFinite(amount) ? amount : 0)),
    });
  }

  observe(name: string, value: number, labels: MetricLabels = {}): void {
    this.assertMetric(name, 'summary', labels);
    const key = seriesKey(name, labels);
    const current = this.observations.get(key);
    this.observations.set(key, {
      name,
      labels: normalizedLabels(labels),
      count: (current?.count ?? 0) + 1,
      sum: (current?.sum ?? 0) + (Number.isFinite(value) ? value : 0),
    });
  }

  observeHistogram(name: string, value: number, buckets: readonly number[], labels: MetricLabels = {}): void {
    this.assertMetric(name, 'histogram', labels);
    const normalizedBuckets = [...new Set(buckets.filter(Number.isFinite))].sort((left, right) => left - right);
    if (normalizedBuckets.length === 0) throw new Error(`Histogram ${name} requires at least one finite bucket`);
    const key = seriesKey(name, labels);
    const current = this.histograms.get(key);
    if (current && (current.buckets.length !== normalizedBuckets.length || current.buckets.some((bucket, index) => bucket !== normalizedBuckets[index]))) {
      throw new Error(`Histogram ${name} buckets cannot change after the first observation`);
    }
    const sample = Number.isFinite(value) ? value : 0;
    const bucketCounts = current?.bucketCounts.slice() ?? normalizedBuckets.map(() => 0);
    normalizedBuckets.forEach((bucket, index) => { if (sample <= bucket) bucketCounts[index] = (bucketCounts[index] ?? 0) + 1; });
    this.histograms.set(key, {
      name,
      labels: normalizedLabels(labels),
      count: (current?.count ?? 0) + 1,
      sum: (current?.sum ?? 0) + sample,
      buckets: normalizedBuckets,
      bucketCounts,
    });
  }

  render(): string {
    if (this.collectRuntimeMetrics) this.collectProcessMetrics();
    const lines: string[] = [];
    const metricNames = [...this.metricTypes.keys()].sort((left, right) => left.localeCompare(right));
    for (const name of metricNames) {
      const type = this.metricTypes.get(name);
      if (!type) continue;
      lines.push(`# TYPE ${name} ${type}`);
      if (type === 'counter' || type === 'gauge') {
        const source = type === 'counter' ? this.counters : this.gauges;
        for (const series of [...source.values()].filter((entry) => entry.name === name).sort((left, right) => seriesKey(left.name, left.labels).localeCompare(seriesKey(right.name, right.labels)))) {
          lines.push(metricLine(name, series.labels, series.value));
        }
      } else if (type === 'summary') {
        for (const series of [...this.observations.values()].filter((entry) => entry.name === name)) {
          lines.push(metricLine(`${name}_count`, series.labels, series.count), metricLine(`${name}_sum`, series.labels, series.sum));
        }
      } else {
        for (const series of [...this.histograms.values()].filter((entry) => entry.name === name)) {
          series.buckets.forEach((bucket, index) => lines.push(metricLine(`${name}_bucket`, { ...series.labels, le: String(bucket) }, series.bucketCounts[index] ?? 0)));
          lines.push(metricLine(`${name}_bucket`, { ...series.labels, le: '+Inf' }, series.count));
          lines.push(metricLine(`${name}_count`, series.labels, series.count), metricLine(`${name}_sum`, series.labels, series.sum));
        }
      }
    }
    return `${lines.join('\n')}\n`;
  }

  private assertMetric(name: string, type: 'counter' | 'gauge' | 'summary' | 'histogram', labels: MetricLabels): void {
    if (!metricNamePattern.test(name)) throw new Error(`Invalid Prometheus metric name: ${name}`);
    for (const labelName of Object.keys(labels)) if (!labelNamePattern.test(labelName) || labelName === 'le') throw new Error(`Invalid Prometheus label name: ${labelName}`);
    const existingType = this.metricTypes.get(name);
    if (existingType && existingType !== type) throw new Error(`Metric ${name} is already registered as ${existingType}`);
    this.metricTypes.set(name, type);
  }

  private collectProcessMetrics(): void {
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    this.set('process_uptime_seconds', process.uptime());
    this.set('process_resident_memory_bytes', memory.rss);
    this.set('nodejs_heap_size_total_bytes', memory.heapTotal);
    this.set('nodejs_heap_size_used_bytes', memory.heapUsed);
    this.set('nodejs_external_memory_bytes', memory.external);
    this.set('nodejs_event_loop_lag_seconds', this.eventLoopLagSeconds);
    this.setCounter('process_cpu_user_seconds_total', cpu.user / 1_000_000);
    this.setCounter('process_cpu_system_seconds_total', cpu.system / 1_000_000);
  }

  private scheduleEventLoopLagSample(): void {
    const intervalMilliseconds = 1_000;
    const startedAt = performance.now();
    const timer = setTimeout(() => {
      this.eventLoopLagSeconds = Math.max(0, (performance.now() - startedAt - intervalMilliseconds) / 1_000);
      this.scheduleEventLoopLagSample();
    }, intervalMilliseconds);
    timer.unref();
  }
}

export const technicalMetrics = new TechnicalMetrics(true);
