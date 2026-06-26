# Multi-Tenant API Key Gateway

A secure, multi-tenant API key management service built with Node.js, Express, PostgreSQL, and Redis. This service provides endpoints to generate, rotate, and revoke API keys, and includes a high-performance sliding-window rate limiter using Redis sorted sets. 

## Features
- **API Key Management**: Secure generation and storage (SHA-256 hashed) of API keys.
- **Tenant Management**: Multi-tenant architecture to support multiple users/organizations.
- **Rate Limiting**: Sliding window log rate limiting built from scratch using Redis.
- **Key Rotation**: Seamless API key rotation with a grace period.
- **Audit Logging**: Comprehensive logging of all API requests to protected endpoints.
- **Frontend Dashboard**: A responsive dashboard to view, create, rotate, and revoke keys, alongside usage visualizations.

## Architecture

1. **Client**: Makes requests to the protected endpoints using `Authorization: Bearer <key>`.
2. **API Gateway (Node.js/Express)**: Authenticates the key via PostgreSQL, checks rate limits via Redis, and logs the request.
3. **Redis**: Used exclusively as an ultra-fast store for tracking request timestamps within the rate limit window.
4. **PostgreSQL**: Persistent storage for tenants, API keys (hashed), and audit logs.

## Setup and Installation

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)

### Running Locally
This project uses Docker to orchestrate the Node.js API, PostgreSQL database, and Redis cache. 

To start the application:
```bash
docker-compose up -d --build
```

Wait until all services are healthy (approx. 10-15 seconds for DB initialization). You can verify the health using:
```bash
docker ps
```

Once running, the application exposes:
- The Backend API and Frontend Dashboard at `http://localhost:3000`

### Environment Variables
An `.env.example` file is provided. The `docker-compose.yml` file sets the necessary variables automatically, but if you wish to run the Node.js application outside of Docker, copy `.env.example` to `.env` and adjust the connection strings.

## Usage Guide

1. Navigate to `http://localhost:3000` to open the API Key Dashboard.
2. Click **+ Create New Key** to generate an API key. **Store the key securely** as it is only displayed once.
3. Test the protected endpoint with the newly generated key:
```bash
curl -H "Authorization: Bearer <your_api_key>" http://localhost:3000/api/protected
```
4. Rapidly fire requests to the endpoint to observe the Rate Limiter returning `429 Too Many Requests`.
5. Rotate or Revoke the key using the Dashboard UI.

## Testing Core Requirements

The core requirements specified in the evaluation can be tested as follows:
- **Rate Limiting**: Configured at 10 requests per minute by default. Requests beyond this within a sliding 60-second window will be rejected with a 429 status and a `Retry-After` header. You can quickly test this in PowerShell using:
  ```powershell
  1..15 | ForEach-Object { curl -H "Authorization: Bearer <your_api_key>" http://localhost:3000/api/protected }
  ```
- **Database Schema & Key Revocation**: The `init.sql` script correctly sets up the `tenants`, `api_keys`, and `audit_logs` tables with constraints on startup. Revoking a key performs a "soft delete" (`is_active = FALSE`) to disable the key while preserving audit history integrity.
- **Authentication**: Validation explicitly fails without a valid `Authorization: Bearer <token>` header, or if the key has been revoked.