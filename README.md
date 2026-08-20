# hello-service

A lightweight **Node.js + Express** microservice used as the **target deployment**
for an end-to-end GitOps + Observability pipeline (Minikube, ArgoCD, Prometheus,
VictoriaLogs). It exposes a trivial JSON API, emits structured JSON logs to
stdout, and is designed to be packaged and deployed by your own DevOps tooling
(Dockerfile, Kubernetes manifests, ArgoCD Application, etc.).

This repo intentionally contains **only application code and unit tests** — no
Dockerfiles, Terraform, Ansible, or Kubernetes manifests.

## API

| Endpoint      | Description                                                                        |
| ------------- | ---------------------------------------------------------------------------------- |
| `GET /`       | `{"message": "...", "hostname": "...", "version": "..."}` greeting                 |
| `GET /health` | `{"status": "ok"}` with HTTP 200 — use for liveness/readiness probes               |

## Configuration (environment variables)

| Variable      | Default                                       | Purpose                       |
| ------------- | --------------------------------------------- | ----------------------------- |
| `APP_NAME`    | `hello-service`                               | Service/log name              |
| `APP_VERSION` | `0.1.0`                                       | Version reported by `GET /`   |
| `GREETING`    | `Hello from the GitOps observability pipeline!` | Custom greeting in `GET /` |
| `PORT`        | `8000`                                        | HTTP listen port              |
| `HOST`        | `0.0.0.0`                                     | HTTP listen host              |
| `LOG_LEVEL`   | `INFO`                                        | `DEBUG`, `INFO`, `WARN`, `ERROR` |

## Run locally

```bash
npm install
npm start                 # or: node src/server.js
```

Override config at runtime, e.g.:

```bash
GREETING="Welcome from prod" APP_VERSION="1.2.0" LOG_LEVEL=DEBUG PORT=8080 npm start
```

## Test

```bash
npm test                  # Node's built-in test runner (node --test), no extra deps
```

## Smoke test

```bash
curl -s http://localhost:8000/health   # {"status":"ok"}
curl -s http://localhost:8000/         # {"message":"...","hostname":"...","version":"..."}
```

## Log output example

Every line is a JSON object on stdout — no formatter/parser needed by your log
shipper:

```json
{"timestamp":"2026-08-20T16:58:29.403Z","level":"INFO","logger":"hello-service","message":"root endpoint hit","endpoint":"/"}
{"timestamp":"2026-08-20T16:58:29.429Z","level":"INFO","logger":"hello-service","message":"request completed","method":"GET","path":"/","status":200,"duration_ms":26.28}
```

Each request also produces an access-log entry (`request completed`) with
`method`, `path`, `status`, and `duration_ms`, so you can derive request-rate and
latency metrics in VictoriaLogs/Prometheus.

The server also handles `SIGTERM`/`SIGINT` gracefully (logs `service stopping`
and closes the HTTP server) — important for clean Kubernetes pod termination.

## Project layout

```
src/
  app.js       # Express app factory (routes + access-log middleware)
  server.js    # Entry point: reads env, starts server, graceful shutdown
  logger.js    # Tiny structured JSON logger (stdout), log-level aware
test/
  app.test.js  # Unit tests: API endpoints + JSON logger (node:test + fetch)
package.json   # Deps (express only), scripts: start / dev / test
```