export interface MetricDatapoint {
  ts: number
  v: number
}

export interface MetricSeries {
  id: string
  label: string
  unit: string
  datapoints: MetricDatapoint[]
}

export interface MetricsResponse {
  window: { start: string; end: string; period_seconds: number }
  series: MetricSeries[]
}
