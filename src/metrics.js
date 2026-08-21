const DURATION_BUCKETS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10,
];

function keyOf(method, path, status) {
  return `${method} ${path} ${status}`;
}

function escapeLabel(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

export function createMetrics({
  name = process.env.APP_NAME || "light-service",
} = {}) {
  const requestTotals = new Map();
  const requestBuckets = new Map();
  for (const b of DURATION_BUCKETS) {
    requestBuckets.set(b, new Map());
  }
  const requestSums = new Map();

  let startTime = Date.now();

  function record(method, path, status, durationSeconds) {
    const key = keyOf(method, path, status);

    const total = requestTotals.get(key) || { method, path, status, value: 0 };
    total.value += 1;
    requestTotals.set(key, total);

    for (const b of DURATION_BUCKETS) {
      if (durationSeconds <= b) {
        const bucketMap = requestBuckets.get(b);
        const bucket = bucketMap.get(key) || { method, path, status, value: 0 };
        bucket.value += 1;
        bucketMap.set(key, bucket);
      }
    }

    const sum = requestSums.get(key) || { method, path, status, value: 0 };
    sum.value += durationSeconds;
    requestSums.set(key, sum);
  }

  function render() {
    const lines = [];
    const ts = Date.now();
    const uptime = (ts - startTime) / 1000;

    lines.push(`# HELP ${name}_uptime_seconds Process uptime in seconds.`);
    lines.push(`# TYPE ${name}_uptime_seconds gauge`);
    lines.push(`${name}_uptime_seconds ${uptime.toFixed(3)} ${ts}`);

    lines.push(`# HELP ${name}_http_requests_total Total number of HTTP requests.`);
    lines.push(`# TYPE ${name}_http_requests_total counter`);
    for (const { method, path, status, value } of requestTotals.values()) {
      lines.push(
        `${name}_http_requests_total{method="${escapeLabel(method)}",path="${escapeLabel(
          path
        )}",status="${status}"} ${value} ${ts}`
      );
    }

    lines.push(`# HELP ${name}_http_request_duration_seconds HTTP request latency.`);
    lines.push(`# TYPE ${name}_http_request_duration_seconds histogram`);
    for (const [bucket, bucketMap] of requestBuckets.entries()) {
      for (const { method, path, status, value } of bucketMap.values()) {
        lines.push(
          `${name}_http_request_duration_seconds_bucket{method="${escapeLabel(
            method
          )}",path="${escapeLabel(path)}",status="${status}",le="${bucket}"} ${value} ${ts}`
        );
      }
    }
    for (const { method, path, status, value } of requestSums.values()) {
      lines.push(
        `${name}_http_request_duration_seconds_sum{method="${escapeLabel(
          method
        )}",path="${escapeLabel(path)}",status="${status}"} ${value.toFixed(6)} ${ts}`
      );
    }
    for (const { method, path, status, value } of requestTotals.values()) {
      lines.push(
        `${name}_http_request_duration_seconds_count{method="${escapeLabel(
          method
        )}",path="${escapeLabel(path)}",status="${status}"} ${value} ${ts}`
      );
    }

    return lines.join("\n") + "\n";
  }

  return { record, render, reset: () => (startTime = Date.now()) };
}
