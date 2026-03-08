# kpanel Security Review — Enterprise Readiness Assessment

**Date:** 2026-03-08
**Scope:** Full codebase — Go server (`server/`) and React frontend (`web/src/`)
**Verdict:** Suitable for personal/dev use only. Major gaps block enterprise adoption.

---

## Enterprise Adoption Blockers (Must Fix)

### 1. No Authentication or Authorization — CRITICAL

**Files:** All handlers in `server/internal/api/`

Any HTTP client can call every endpoint without credentials. This means:
- `GET /api/connections` exposes all cluster credentials
- `POST /api/connections/:id/topics/:name/peek` reads arbitrary messages
- `POST /api/connections/:id/groups/:name/reset-offsets` allows destructive offset resets
- No multi-user support; no way to restrict actions by role

**Fix:** Add an authentication layer (even a simple API key or OAuth PKCE flow for a local app) and route-level authorization middleware.

---

### 2. No Audit Logging — CRITICAL

**Files:** All handlers in `server/internal/api/`

No structured log records any business action. You cannot tell who deleted a topic, who reset offsets, or who exported messages. The HTTP access log (`chi.Logger` middleware) logs paths but not user identity or business intent.

Compliance requirements (SOX, HIPAA, PCI-DSS) mandate immutable audit trails for any system touching production data.

**Fix:** Add a structured audit log (JSON to file or stdout) that records: timestamp, actor, action, connection ID, resource, outcome.

---

### 3. No HTTPS — CRITICAL

**File:** `server/cmd/kpanel/main.go:94`

```go
http.ListenAndServe(addr, r)  // plaintext HTTP only
```

All traffic — including SASL credentials entered via the connection form — is transmitted unencrypted. Even on localhost, this is a risk in shared/corporate environments.

**Fix:** Add TLS support with a self-signed cert option and a flag to provide a custom cert/key pair. At minimum, document the risk and provide a TLS-enabled mode.

---

### 4. No Rate Limiting — HIGH

**Files:** All handlers

Destructive operations (`DELETE /topics`, `reset-offsets`) have no request throttling. A bug or malicious script could rapidly delete topics or reset consumer groups. CloudWatch metric queries are unbounded — each is a billable AWS API call.

**Fix:** Add per-endpoint rate limiting middleware (e.g., `golang.org/x/time/rate`). Apply stricter limits to destructive operations.

---

### 5. No Secrets Rotation — HIGH

**Files:** `server/internal/config/store.go`, `server/internal/api/connections.go`

SASL credentials are stored statically with no rotation workflow. Compromised credentials remain valid until manually edited. There is no credential age tracking or expiry warning.

**Fix:** Document TTL guidance. For AWS IAM connections, verify that the franz-go SASL closure re-fetches credentials on every call (it does, but verify short-lived tokens are not cached).

---

### 6. No Read-Only Mode / Separation of Duties — HIGH

There is no way to run kpanel in a safe, query-only mode. All users can delete topics, reset offsets, and add connections. This prevents sharing access safely across teams.

**Fix:** Add a `KPANEL_READONLY=true` environment variable that disables all mutating endpoints at the router level.

---

## High Severity

### 7. CloudWatch SEARCH Expression Injection — HIGH

**File:** `server/internal/api/metrics.go:216-220, 293-298, 315-320`

Topic names and cluster names are interpolated directly into CloudWatch SEARCH expressions:

```go
fmt.Sprintf(
    `SEARCH('{AWS/Kafka,...} MetricName="%s" "Cluster Name"="%s" Topic="%s"', ...)`,
    metricName, clusterName, topicName, stat, cwPeriod,
)
```

A topic named `test" OR "Cluster Name"="other-cluster` breaks the query boundary and could return metrics from other clusters.

**Fix:** Validate that `clusterName`, `topicName`, and `groupID` match `[a-zA-Z0-9._-]+` before building expressions. Reject or sanitize inputs that contain quotes or CloudWatch metacharacters.

---

### 8. SSRF via Broker Address Input — HIGH

**File:** `server/internal/api/connections.go:61-64`

Broker addresses are accepted from user input with no network validation. A user (or attacker with API access) could point kpanel at `169.254.169.254:80` (AWS metadata service) or internal services, causing the Go server to act as a proxy.

**Fix:** Validate that broker addresses resolve to non-private/non-loopback IPs, or at minimum enforce a `host:port` format check with port number validation.

---

### 9. Raw Internal Errors Returned to Frontend — HIGH

**Files:** Multiple handlers, e.g. `server/internal/api/topics.go:105, 112, 248`

```go
writeError(w, http.StatusInternalServerError, err.Error())
```

franz-go and Kafka errors can contain internal broker hostnames, cluster topology details, and protocol-level information. These are returned verbatim to the browser.

**Fix:** Log the full error server-side; return only a sanitized user-facing message (e.g., `"Failed to list topics"`) to the client.

---

### 10. Force-Reset Without Strong Confirmation — HIGH

**File:** `web/src/components/consumer-groups/ResetOffsetsModal.tsx:47`

The "force" flag that resets offsets even when consumers are active defaults off but can be enabled with a single checkbox. A warning is shown but not enforced. Accidental data loss is a real risk.

**Fix:** Add a typed-confirmation dialog (user must type the group name) before allowing force resets.

---

## Medium Severity

### 11. Message Peek Has No Total Size Cap — MEDIUM

**File:** `server/internal/api/topics.go:375-377`

Up to 500 messages are fetched without checking their total byte size. A topic with 500 × 10MB messages would cause the server to allocate 5GB of memory per request.

**Fix:** Add a `maxBytesPerPeek` limit (e.g., 50MB) and return a truncation notice when hit.

---

### 12. CA Certificate Stored Without Validation — MEDIUM

**File:** `server/internal/api/connections.go:344`

PEM-format CA certificates are written to disk without parsing or validation. An invalid file causes connection failures with a confusing error at runtime, not at save time.

**Fix:** Parse the PEM and verify it contains at least one valid certificate before writing to disk.

---

### 13. CloudWatch Query Parameters Not Validated — MEDIUM

**File:** `server/internal/api/metrics.go:96-115`

`broker_id`, `topic`, and `group` query parameters used in CloudWatch queries are taken raw from the URL with no format validation.

**Fix:** Validate `broker_id` is a non-negative integer; validate topic/group names against Kafka naming rules (`[a-zA-Z0-9._-]+`, max 249 chars).

---

### 14. ARN Parsing Without Region Validation — MEDIUM

**File:** `server/internal/api/msk.go:38-50`

AWS ARNs from user input are parsed with `strings.SplitN` and the extracted region is used directly in API calls with no format check (`[a-z]{2}-[a-z]+-[0-9]`).

**Fix:** Validate parsed region against a regex or an allowlist before use.

---

### 15. Hard-Coded Default Region — MEDIUM

**File:** `server/internal/api/aws.go:26-32`

MSK discovery silently defaults to `us-east-1` if `AWS_REGION` is unset. This provides no discovery in other regions and could silently operate on wrong accounts.

**Fix:** Return a clear error if no region is configured rather than defaulting. Add a UI field for region selection.

---

## Low Severity

| # | File | Issue |
|---|------|-------|
| 16 | `server/cmd/kpanel/main.go` | No structured logging — no log levels, no request IDs, no tracing |
| 17 | `server/internal/api/handlers.go` | Health check returns hardcoded `"ok"` without testing Kafka connectivity |
| 18 | All handlers | No `X-Request-ID` propagation — can't correlate frontend → backend → Kafka errors |
| 19 | `server/internal/api/connections.go:290` | Connection status timeout hard-coded to 15s, not configurable |
| 20 | `server/internal/api/metrics.go:121` | CloudWatch queries not cached — repeated navigation causes unbounded API calls and AWS cost |

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 (no auth, no audit log, no HTTPS) |
| High | 7 |
| Medium | 5 |
| Low | 5 |

**The three critical issues (no auth, no audit log, no HTTPS) alone make enterprise deployment impossible.** They must be addressed before any compliance review or production use by multiple users.

The high-severity issues (CloudWatch injection, SSRF, raw error leakage, no read-only mode, no rate limiting) should be addressed in the same iteration to reach a baseline security posture.

Medium and low issues represent operational maturity gaps that matter for teams running this at scale.
