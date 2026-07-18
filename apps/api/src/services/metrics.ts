class TechnicalMetrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, number>();
  private readonly observations = new Map<string, { count: number; sum: number }>();

  increment(name: string, amount = 1): void { this.counters.set(name, (this.counters.get(name) ?? 0) + amount); }
  set(name: string, value: number): void { this.gauges.set(name, Number.isFinite(value) ? value : 0); }
  observe(name: string, value: number): void {
    const current = this.observations.get(name) ?? { count: 0, sum: 0 };
    this.observations.set(name, { count: current.count + 1, sum: current.sum + value });
  }

  render(): string {
    const lines: string[] = [];
    for (const [name, value] of [...this.counters].sort(([left], [right]) => left.localeCompare(right))) lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
    for (const [name, value] of [...this.gauges].sort(([left], [right]) => left.localeCompare(right))) lines.push(`# TYPE ${name} gauge`, `${name} ${value}`);
    for (const [name, value] of [...this.observations].sort(([left], [right]) => left.localeCompare(right))) lines.push(`# TYPE ${name} summary`, `${name}_count ${value.count}`, `${name}_sum ${value.sum}`);
    return `${lines.join('\n')}\n`;
  }
}

export const technicalMetrics = new TechnicalMetrics();
