-- ============================================================
-- Multi-Tenant API Key Gateway — Database Initialization
-- ============================================================

-- tenants table
CREATE TABLE tenants (
    id   SERIAL       PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- api_keys table
CREATE TABLE api_keys (
    id                   SERIAL       PRIMARY KEY,
    tenant_id            INTEGER      NOT NULL REFERENCES tenants(id),
    key_hash             VARCHAR(255) NOT NULL UNIQUE,
    key_prefix           VARCHAR(10)  NOT NULL,
    last_four            VARCHAR(4)   NOT NULL,
    rate_limit_per_minute INTEGER     NOT NULL DEFAULT 100,
    is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
    expires_at           TIMESTAMP,
    created_at           TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- audit_logs table
CREATE TABLE audit_logs (
    id          SERIAL       PRIMARY KEY,
    api_key_id  INTEGER      NOT NULL REFERENCES api_keys(id),
    endpoint    VARCHAR(255) NOT NULL,
    status_code INTEGER      NOT NULL,
    timestamp   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Seed Data
-- ============================================================
INSERT INTO tenants (name) VALUES ('Acme Corp');
INSERT INTO tenants (name) VALUES ('Globex Systems');