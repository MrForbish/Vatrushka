import { describe, expect, it } from 'vitest';

import { TechnicalMetrics } from './metrics.js';

describe('TechnicalMetrics', () => {
  it('renders stable labelled counter and gauge families', () => {
    const metrics = new TechnicalMetrics();
    metrics.increment('api_http_requests_total', 2, { route: '/v1/servers/:serverId', method: 'GET', status_class: '2xx' });
    metrics.set('api_readiness', 1);

    const output = metrics.render();
    expect(output).toContain('# TYPE api_http_requests_total counter');
    expect(output).toContain('api_http_requests_total{method="GET",route="/v1/servers/:serverId",status_class="2xx"} 2');
    expect(output).toContain('# TYPE api_readiness gauge\napi_readiness 1');
  });

  it('renders cumulative histogram buckets for PromQL quantiles', () => {
    const metrics = new TechnicalMetrics();
    metrics.observeHistogram('api_http_request_duration_seconds', 0.04, [0.01, 0.05, 0.1], { route: '/health/ready' });
    metrics.observeHistogram('api_http_request_duration_seconds', 0.08, [0.01, 0.05, 0.1], { route: '/health/ready' });

    const output = metrics.render();
    expect(output).toContain('api_http_request_duration_seconds_bucket{le="0.01",route="/health/ready"} 0');
    expect(output).toContain('api_http_request_duration_seconds_bucket{le="0.05",route="/health/ready"} 1');
    expect(output).toContain('api_http_request_duration_seconds_bucket{le="0.1",route="/health/ready"} 2');
    expect(output).toContain('api_http_request_duration_seconds_bucket{le="+Inf",route="/health/ready"} 2');
    expect(output).toContain('api_http_request_duration_seconds_count{route="/health/ready"} 2');
  });

  it('rejects type conflicts and reserved histogram labels', () => {
    const metrics = new TechnicalMetrics();
    metrics.set('shared_metric', 1);
    expect(() => metrics.increment('shared_metric')).toThrow(/already registered/u);
    expect(() => metrics.increment('valid_metric_total', 1, { le: '1' })).toThrow(/Invalid Prometheus label/u);
  });

  it('increments and clamps gauges without changing their type', () => {
    const metrics = new TechnicalMetrics();
    metrics.addGauge('api_http_requests_in_flight', 1, { route: '/health' });
    metrics.addGauge('api_http_requests_in_flight', 2, { route: '/health' });
    metrics.addGauge('api_http_requests_in_flight', -4, { route: '/health' });

    expect(metrics.render()).toContain('api_http_requests_in_flight{route="/health"} 0');
  });
});
