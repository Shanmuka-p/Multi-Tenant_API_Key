# Multi-Tenant API Key Gateway

A production-quality, secure multi-tenant API key management service built with **Node.js**, **TypeScript**, **Express**, **PostgreSQL**, and **Redis**. Implements key hashing, rotation with grace periods, a hand-crafted sliding-window rate limiter using Redis sorted sets, full audit logging, and a rich management dashboard.

## Features

| Feature | Detail |
|---|---|
| **API Key Management** | Secure generation (32 random bytes, Base64url-encoded), SHA-256 hashing — plaintext never stored |
| **Multi-Tenancy** | Isolated key namespaces per tenant |
| **Sliding-Window Rate Limiting** | Implemented from scratch using Redis sorted sets (`ZREMRANGEBYSCORE` + `ZCARD` + `ZADD`), with accurate `Retry-After` headers and full `X-RateLimit-*` response headers |
| **Key Rotation** | Generates a new key while the old one stays valid for a 1-minute grace period |
| **Key Revocation** | Immediate soft-delete (`is_active = FALSE`) |
| **Audit Logging** | Every authenticated request (200 and 429) is recorded with key ID, endpoint, status code, and timestamp |
| **Management Dashboard** | Real-time SPA with stats cards, Chart.js activity chart, paginated audit logs, copy-to-clipboard, proper confirm modals |
| **Containerized** | Full Docker Compose stack with health checks, `depends_on`, named volumes, and multi-stage Dockerfile |

## Architecture

```
Client
  │  Authorization: Bearer sk_live_...
  ▼
API Gateway (Node.js / Express)
  │  1. authMiddleware   → hash key, query PostgreSQL
  │  2. rateLimitMiddleware → Redis ZSET sliding window
  ▼                     ▼
PostgreSQL            Redis
(tenants,             (rate_limit:{keyId}
 api_keys,             sorted set of
 audit_logs)           request timestamps)
```

## Quick Start

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Run the Stack

```bash
docker-compose up -d --build
```

Wait ~15 seconds for all services to become healthy. Check status:

```bash
docker-compose ps
```

The application is available at **http://localhost:3000**

### Environment Variables

Copy `.env.example` to `.env` for local (non-Docker) development:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|---|---|---|
| `DB_URL` | `postgres://user:pass@localhost:5432/apikeys` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `PORT` | `3000` | Server port |

## API Reference

### Key Management

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/tenants/:tenantId/keys` | Issue a new API key |
| `GET` | `/api/tenants/:tenantId/keys` | List all keys (masked) |
| `GET` | `/api/tenants/:tenantId/stats` | Dashboard stats summary |
| `POST` | `/api/keys/:keyId/rotate` | Rotate a key (1-min grace period) |
| `DELETE` | `/api/keys/:keyId` | Immediately revoke a key |

### Protected & Audit

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/protected` | Rate-limited test endpoint (requires `Authorization: Bearer <key>`) |
| `GET` | `/api/logs` | Paginated audit logs (`?limit=50&offset=0`) |
| `GET` | `/api/logs/activity` | Per-minute request counts for the last hour |

### Response Headers (on protected endpoint)

```
X-RateLimit-Limit:     100       # configured limit for this key
X-RateLimit-Remaining: 97        # requests remaining in current window
Retry-After:           42        # (only on 429) seconds until window resets
X-RateLimit-Reset:     1719000...# Unix timestamp when window resets
```

## Testing Core Requirements

### 1. Rate Limiting

Issue a key with `rateLimitPerMinute: 5`, then fire 6 requests:

```bash
# Issue key
KEY=$(curl -s -X POST http://localhost:3000/api/tenants/1/keys \
  -H "Content-Type: application/json" \
  -d '{"rateLimitPerMinute":5}' | python -c "import sys,json; print(json.load(sys.stdin)['apiKey'])")

# Fire 6 requests (first 5 = 200, 6th = 429)
for i in {1..6}; do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" \
    -H "Authorization: Bearer $KEY" http://localhost:3000/api/protected
done
```

**PowerShell:**
```powershell
$key = (Invoke-RestMethod -Uri "http://localhost:3000/api/tenants/1/keys" -Method POST -ContentType "application/json" -Body '{"rateLimitPerMinute":5}').apiKey
1..6 | ForEach-Object { Invoke-WebRequest -Uri "http://localhost:3000/api/protected" -Headers @{Authorization="Bearer $key"} -SkipHttpErrorCheck | Select-Object -ExpandProperty StatusCode }
```

### 2. Key Rotation Grace Period

```bash
# Rotate a key
curl -X POST http://localhost:3000/api/keys/1/rotate

# Both old and new key work for 60 seconds
# After 60 seconds, only the new key works
```

### 3. Database Schema Verification

```bash
docker-compose exec db psql -U user -d apikeys -c "\d api_keys"
docker-compose exec db psql -U user -d apikeys -c "SELECT * FROM tenants;"
```

## Postman Collection

A complete Postman collection is included: [`Multi-Tenant_API_Gateway.postman_collection.json`](./Multi-Tenant_API_Gateway.postman_collection.json)

Import it into Postman to test all endpoints interactively. Set the `apiKey` collection variable after generating a key.

## Rate Limiter Design

The sliding-window log algorithm is implemented in [`src/services/rateLimiterService.ts`](./src/services/rateLimiterService.ts):

1. **`ZREMRANGEBYSCORE key 0 (now - 60000)`** — evict timestamps older than 60 seconds
2. **`ZCARD key`** — count existing requests in the window *before* adding the current one
3. If `count >= limit` → reject with `429` and accurate `Retry-After` (time until the oldest entry expires)
4. If allowed → **`ZADD key score=now value="now-random"`** + **`EXPIRE key 61`**

> **Key design choice**: The count is read *before* adding the current request. This prevents blocked requests from inflating the window, which is a subtle but important correctness property.
