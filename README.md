# GitOps Observability Stack

An end-to-end reference stack that demonstrates a **GitOps + Observability** workflow on Kubernetes (Minikube). It pairs a small Node.js microservice (`light-service`) with container packaging, declarative Kubernetes manifests, ArgoCD GitOps automation, Prometheus/Grafana monitoring, and a CI pipeline that builds, pushes, and auto-updates the deployment image.

> **Repository vs. application naming.** This repository is the *GitOps Observability Stack*. The application it deploys is named **`light-service`** (used consistently in `k8s/`, ArgoCD, and CI). Note: `package.json` still declares the name `hello-service` and `src/app.js` defaults the logger name to `hello-service`. See [Known Issues](#known-issues) for details.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
  - [Local Development](#local-development)
  - [Full GitOps Deployment](#full-gitops-deployment)
- [Application Reference](#application-reference)
  - [API](#api)
  - [Configuration](#configuration)
  - [Logging](#logging)
- [Kubernetes & ArgoCD](#kubernetes--argocd)
- [CI/CD Pipeline](#cicd-pipeline)
- [Observability](#observability)
- [Testing](#testing)
- [Known Issues](#known-issues)
- [License](#license)

---

## Overview

This repository is both the **application source** and the **GitOps configuration** for a small HTTP service. The intended flow is:

1. A developer pushes code to `main` (or `dev`).
2. **GitHub Actions** builds a Docker image, pushes it to Docker Hub as `voidschema/light-service`, and commits the new image tag back into `k8s/deployment.yaml`.
3. **ArgoCD** detects the change in Git and synchronizes the updated manifests into the cluster (self-healing, pruning enabled).
4. **kube-prometheus-stack** (Prometheus + Grafana) runs alongside the application to provide cluster and workload observability.

The application itself is intentionally minimal: a single Express process that serves a greeting endpoint and a health endpoint, emitting structured JSON logs to stdout.

---

## Architecture

```
┌──────────┐    push (main/dev)    ┌──────────────────────────┐
│  GitHub  │ ───────────────────▶ │  GitHub Actions (CI)      │
│  Repo    │                       │  • build & push image     │
└──────────┘                       │  • update k8s image tag   │
      │                            └───────────┬──────────────┘
      │ clone / sync                          │ push image
      ▼                                       ▼
┌─────────────────────────────┐      ┌──────────────────────┐
│  ArgoCD (argocd ns)         │      │  Docker Hub           │
│  • light-service-app        │◀────│  voidschema/          │
│    → syncs k8s/             │      │  light-service:<tag>  │
│  • monitoring               │      └──────────────────────┘
│    → kube-prometheus-stack  │
└─────────────┬───────────────┘
              │ applies
              ▼
┌─────────────────────────────┐      ┌──────────────────────┐
│  Minikube / Kubernetes      │      │  kube-prometheus-stack│
│  • default ns: light-service│◀────│  (monitoring ns)      │
│    Deployment (2 replicas)  │ sync │  Prometheus + Grafana │
│    Service (NodePort 80→8000)│     └──────────────────────┘
└─────────────────────────────┘
```

**Observability note:** Monitoring is provided by the `kube-prometheus-stack` Helm chart (Prometheus + Grafana), **not** VictoriaLogs. The application does not expose a `/metrics` endpoint; observability of the app is currently limited to cluster-level metrics and its stdout JSON logs. See [Observability](#observability) and [Known Issues](#known-issues).

---

## Repository Structure

```
gitops-observability-stack/
├── src/
│   ├── app.js          # Express app factory: routes + access-log middleware
│   ├── logger.js       # Minimal structured JSON logger (stdout), level-aware
│   └── server.js       # Entry point: env config, listen, graceful shutdown
├── test/
│   └── app.test.js     # Unit tests for API + logger (node:test + fetch)
├── k8s/
│   ├── deployment.yaml # light-service Deployment (2 replicas, probes, limits)
│   └── services.yaml   # NodePort Service (80 → 8000)
├── .github/
│   └── workflows/
│       └── ci.yaml     # Build/push image + auto-update deployment image tag
├── Dockerfile          # node:22-alpine, non-root, builds & runs the app
├── docker-compose.yaml # Local dev: build app, bind-mount, hot reload
├── argo-cd.yaml        # ArgoCD Application: syncs k8s/ → default namespace
├── monitoring-tools.yaml # ArgoCD Application: kube-prometheus-stack Helm chart
├── package.json        # Deps (express only), scripts: start / dev / test
├── .dockerignore
└── .gitignore
```

---

## Prerequisites

| Tool            | Version / Notes                              |
| --------------- | -------------------------------------------- |
| Node.js         | `>=18` (CI builds on `node:22-alpine`)       |
| npm             | Bundled with Node                            |
| Docker          | For local builds and `docker-compose`        |
| kubectl         | Aligned with your cluster version            |
| Minikube        | Or any conformant Kubernetes cluster         |
| ArgoCD          | `argocd` CLI + ArgoCD installed in-cluster   |
| Docker Hub creds | `DOCKER_HUB_USERNAME` / `DOCKER_HUB_TOKEN` (CI secrets) |

---

## Getting Started

### Local Development

Run the service directly with Node:

```bash
npm install
npm start                 # or: node src/server.js
```

Or use Docker Compose for a hot-reloading containerized environment:

```bash
docker compose up         # builds image, serves on http://localhost:8000
```

Override configuration at runtime:

```bash
GREETING="Welcome from prod" APP_VERSION="1.2.0" LOG_LEVEL=DEBUG PORT=8080 npm start
```

### Full GitOps Deployment

1. **Start a cluster and install ArgoCD** (Minikube example):

   ```bash
   minikube start
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```

2. **Register the applications** (this repo + monitoring):

   ```bash
   kubectl apply -f argo-cd.yaml           # light-service-app → k8s/
   kubectl apply -f monitoring-tools.yaml  # monitoring → kube-prometheus-stack
   ```

3. **Verify sync** in the ArgoCD UI or CLI:

   ```bash
   argocd app list
   argocd app get light-service-app
   ```

ArgoCD will automatically sync `k8s/deployment.yaml` and `k8s/services.yaml` into the `default` namespace, and the monitoring stack into the `monitoring` namespace.

---

## Application Reference

### API

| Method | Endpoint    | Description                                                          | Response                              |
| ------ | ----------- | -------------------------------------------------------------------- | ------------------------------------ |
| `GET`  | `/`         | Greeting with hostname and version                                   | `200 {"message","hostname","version"}` |
| `GET`  | `/health`   | Liveness/readiness probe target                                      | `200 {"status":"ok"}`                |
| any    | other       | Unknown route                                                        | `404`                                |

### Configuration

All configuration is supplied via environment variables.

| Variable      | Default                                          | Purpose                                |
| ------------- | ------------------------------------------------ | -------------------------------------- |
| `APP_NAME`    | `hello-service` (server.js uses `light-service`) | Service / log name                     |
| `APP_VERSION` | `0.1.0`                                          | Version reported by `GET /`            |
| `GREETING`    | `Hello from the GitOps observability pipeline!`  | Custom greeting in `GET /`             |
| `PORT`        | `8000`                                           | HTTP listen port                       |
| `HOST`        | `0.0.0.0`                                        | HTTP listen host                       |
| `LOG_LEVEL`   | `INFO`                                           | `DEBUG`, `INFO`, `WARN`, `ERROR`       |

### Logging

Every line written to stdout is a single JSON object — no formatter or parser required by a log shipper:

```json
{"timestamp":"2026-08-20T16:58:29.403Z","level":"INFO","logger":"hello-service","message":"root endpoint hit","endpoint":"/"}
{"timestamp":"2026-08-20T16:58:29.429Z","level":"INFO","logger":"hello-service","message":"request completed","method":"GET","path":"/","status":200,"duration_ms":26.28}
```

Each request produces an access-log entry (`request completed`) with `method`, `path`, `status`, and `duration_ms`. The server also handles `SIGTERM`/`SIGINT` gracefully (logs `service stopping` and closes the listener), which is important for clean Kubernetes pod termination.

---

## Kubernetes & ArgoCD

**`k8s/deployment.yaml`** — `light-service` Deployment:
- 2 replicas, `image: voidschema/light-service:main` (tag is auto-updated by CI)
- Container port `8000`, CPU/memory requests & limits set
- `livenessProbe` and `readinessProbe` against `GET /health` (port 8000)

**`k8s/services.yaml`** — `NodePort` Service mapping `80 → 8000`, selecting `app: light-service`.

**`argo-cd.yaml`** — ArgoCD `Application` named `light-service-app`:
- Source: this repo, path `k8s/`, `targetRevision: HEAD`
- Destination: `default` namespace
- `syncPolicy.automated`: `prune: true`, `selfHeal: true`

**`monitoring-tools.yaml`** — ArgoCD `Application` named `monitoring`:
- Source: `kube-prometheus-stack` Helm chart (`prometheus-community` repo, v58.2.0)
- Destination: `monitoring` namespace, `CreateNamespace=true`
- Adds a Prometheus data source to Grafana (admin password `admin`)
- `selfHeal: false`, `prune: true`

---

## CI/CD Pipeline

`.github/workflows/ci.yaml` runs on pushes to `main` and `dev` (ignoring changes to `README.md` and `argocd/**`):

1. **Checkout** the repository.
2. **Set up Docker Buildx** and **login** to Docker Hub (using repo secrets).
3. **Extract metadata** — image tags are derived as the branch name (`main`/`dev`) and the short commit SHA.
4. **Build & push** `voidschema/light-service:<branch>` and `voidschema/light-service:<short-sha>` to Docker Hub.
5. **Update `k8s/deployment.yaml`** image tag via `sed` to the new SHA tag.
6. **Commit & push** the manifest change (message: `CI: update light-service image tag to <sha> [skip ci]`).

This creates the GitOps loop: the image digest lives in Git, and ArgoCD reconciles the cluster to match.

---

## Observability

Observability is delivered by the **kube-prometheus-stack** deployed through the `monitoring` ArgoCD application into the `monitoring` namespace. It provides:

- **Prometheus** — cluster and workload metrics (scrapes Kubernetes components and service endpoints).
- **Grafana** — dashboards, pre-provisioned with a Prometheus data source (`admin` / `admin`).

Access Grafana locally (port-forward example):

```bash
kubectl -n monitoring port-forward svc/monitoring-grafana 3000:80
# open http://localhost:3000  (login: admin / admin)
```

**What the application emits:** structured JSON logs to stdout and a `/health` endpoint. These are visible via `kubectl logs` and, when a log shipper is added, can be forwarded to your logging backend. The app does **not** currently expose a Prometheus `/metrics` endpoint, so request-rate/latency metrics are not scraped directly from the app — only inferred from cluster/access logs. See [Known Issues](#known-issues).

---

## Testing

Tests use Node's built-in test runner (`node:test`) — no extra dependencies:

```bash
npm test
```

This covers:
- `GET /` returns greeting, hostname, and version
- `GET /health` returns `{"status":"ok"}`
- Unknown routes return `404`
- The JSON logger emits a single valid JSON line and respects log level
- The access-log middleware logs each request as structured JSON

**Smoke test** against a running instance:

```bash
curl -s http://localhost:8000/health   # {"status":"ok"}
curl -s http://localhost:8000/         # {"message":"...","hostname":"...","version":"..."}
```

---

## Known Issues

- **Naming inconsistency.** The repository/app is referred to as `light-service` in `k8s/`, ArgoCD, and CI, but `package.json` declares `hello-service` and `src/app.js` defaults the logger name to `hello-service`. The server entry point (`src/server.js`) correctly uses `light-service`. Standardize `package.json` and the app default if desired.
- **No application metrics endpoint.** The application does not expose `/metrics`, so Prometheus cannot scrape request-rate/latency directly from the app. Observability relies on cluster metrics and stdout logs.
- **Monitoring stack mismatch in history.** Earlier docs referenced VictoriaLogs; the actual deployment uses `kube-prometheus-stack` (Prometheus + Grafana).
- **Dockerfile runs dev mode.** `Dockerfile` ends with `CMD npm run dev` (Node `--watch`), which is appropriate for local use but should be `npm start` for production images.

---

## License

No license file is currently present in this repository. Add a `LICENSE` before distributing.
