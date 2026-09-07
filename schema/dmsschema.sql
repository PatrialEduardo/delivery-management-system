-- =====================================================================
-- Delivery Database Schema (PostgreSQL)
-- Adjusted from Delivery_Database_Specification_v0_3
--
-- Changes made vs. the original spec:
--   1. Added table `product` (was referenced by delivery_product but
--      never defined).
--   2. Added table `attachment` (needed for UC-15: photo/signature).
--   3. `delivery_group_id` and `parent_delivery_id` are now explicit
--      self-referencing foreign keys to delivery.delivery_id.
--   4. All identifiers converted from camelCase to snake_case, since
--      unquoted Postgres identifiers are folded to lowercase.
--   5. `user` table renamed to `app_user` (USER is a reserved word).
--   6. Added CHECK constraints, sensible defaults, and indexes.
--   7. Added created_at/updated_at to role, delivery_status, address
--      for consistency with the rest of the schema.
--   8. Added UNIQUE(company_id, batch_code) on delivery_batch.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- provides gen_random_uuid()

-- ---------------------------------------------------------------------
-- company
-- ---------------------------------------------------------------------
CREATE TABLE company (
    company_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name    VARCHAR(150) NOT NULL,
    trade_name      VARCHAR(150),
    phone           VARCHAR(20),
    email           VARCHAR(150),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    inactivated_at  TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- role
-- ---------------------------------------------------------------------
CREATE TABLE role (
    role_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name    VARCHAR(60) NOT NULL UNIQUE,
    description  TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- app_user  (was "User" -- USER is a reserved keyword in Postgres)
-- ---------------------------------------------------------------------
CREATE TABLE app_user (
    user_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES company(company_id),
    role_id         UUID NOT NULL REFERENCES role(role_id),
    full_name       VARCHAR(150) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    phone           VARCHAR(20),
    last_login_at   TIMESTAMP,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    inactivated_at  TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_app_user_company ON app_user(company_id);

-- ---------------------------------------------------------------------
-- customer
-- ---------------------------------------------------------------------
CREATE TABLE customer (
    customer_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES company(company_id),
    full_name       VARCHAR(150) NOT NULL,
    phone           VARCHAR(20),
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    inactivated_at  TIMESTAMP,
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_customer_company ON customer(company_id);

-- ---------------------------------------------------------------------
-- address
-- ---------------------------------------------------------------------
CREATE TABLE address (
    address_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id  UUID NOT NULL REFERENCES customer(customer_id),
    zip_code     VARCHAR(10),
    street       VARCHAR(150) NOT NULL,
    number       VARCHAR(20),
    district     VARCHAR(100),
    city         VARCHAR(100) NOT NULL,
    state        CHAR(2) NOT NULL,
    complement  VARCHAR(150),
    latitude     NUMERIC(10,7),
    longitude    NUMERIC(10,7),
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_address_customer ON address(customer_id);

-- ---------------------------------------------------------------------
-- product  (NEW -- required by delivery_product, missing from spec)
-- ---------------------------------------------------------------------
CREATE TABLE product (
    product_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES company(company_id),
    product_name  VARCHAR(150) NOT NULL,
    sku           VARCHAR(50),
    unit          VARCHAR(20),          -- e.g. UN, KG, CX
    price         NUMERIC(10,2),
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_product_company ON product(company_id);

-- ---------------------------------------------------------------------
-- delivery_status  (seed/reference table, maintained by developers)
-- ---------------------------------------------------------------------
CREATE TABLE delivery_status (
    delivery_status_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status_code            VARCHAR(50) NOT NULL UNIQUE,
    status_name             VARCHAR(100) NOT NULL,
    status_type             VARCHAR(20) NOT NULL CHECK (status_type IN ('PROCESS', 'RESULT')),
    description             TEXT,
    color_hex               VARCHAR(7) NOT NULL,   -- #RRGGBB
    icon                    VARCHAR(50),
    display_order           INTEGER NOT NULL,
    requires_observation    BOOLEAN NOT NULL DEFAULT FALSE,
    allows_reschedule       BOOLEAN NOT NULL DEFAULT FALSE,
    finishes_delivery       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------
-- delivery_batch
-- ---------------------------------------------------------------------
CREATE TABLE delivery_batch (
    delivery_batch_id  BIGSERIAL PRIMARY KEY,
    company_id          UUID NOT NULL REFERENCES company(company_id),
    driver_user_id      UUID NOT NULL REFERENCES app_user(user_id),
    batch_code          VARCHAR(30) NOT NULL,
    delivery_date       DATE NOT NULL,
    notes               TEXT,
    created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, batch_code)
);
CREATE INDEX idx_delivery_batch_company_date ON delivery_batch(company_id, delivery_date);
CREATE INDEX idx_delivery_batch_driver ON delivery_batch(driver_user_id);

-- ---------------------------------------------------------------------
-- delivery
-- ---------------------------------------------------------------------
CREATE TABLE delivery (
    delivery_id          BIGSERIAL PRIMARY KEY,
    company_id            UUID NOT NULL REFERENCES company(company_id),
    delivery_batch_id     BIGINT NOT NULL REFERENCES delivery_batch(delivery_batch_id),
    customer_id           UUID NOT NULL REFERENCES customer(customer_id),
    address_id            UUID NOT NULL REFERENCES address(address_id),
    driver_user_id        UUID NOT NULL REFERENCES app_user(user_id),
    delivery_status_id    UUID NOT NULL REFERENCES delivery_status(delivery_status_id),
    delivery_group_id     BIGINT REFERENCES delivery(delivery_id),  -- root delivery of the retry chain
    parent_delivery_id    BIGINT REFERENCES delivery(delivery_id),  -- previous attempt
    attempt_number        INTEGER NOT NULL DEFAULT 1,
    delivery_order        INTEGER NOT NULL,
    estimated_time        TIMESTAMP,
    started_at            TIMESTAMP,
    finished_at            TIMESTAMP,
    notes                  TEXT,
    created_at             TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at             TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_delivery_company ON delivery(company_id);
CREATE INDEX idx_delivery_batch ON delivery(delivery_batch_id);
CREATE INDEX idx_delivery_customer ON delivery(customer_id);
CREATE INDEX idx_delivery_driver ON delivery(driver_user_id);
CREATE INDEX idx_delivery_status ON delivery(delivery_status_id);
CREATE INDEX idx_delivery_group ON delivery(delivery_group_id);
CREATE INDEX idx_delivery_parent ON delivery(parent_delivery_id);

-- ---------------------------------------------------------------------
-- delivery_product
-- ---------------------------------------------------------------------
CREATE TABLE delivery_product (
    delivery_product_id  BIGSERIAL PRIMARY KEY,
    delivery_id            BIGINT NOT NULL REFERENCES delivery(delivery_id),
    product_id             UUID NOT NULL REFERENCES product(product_id),
    quantity               NUMERIC(10,2) NOT NULL,
    notes                  TEXT
);
CREATE INDEX idx_delivery_product_delivery ON delivery_product(delivery_id);
CREATE INDEX idx_delivery_product_product ON delivery_product(product_id);

-- ---------------------------------------------------------------------
-- delivery_history
-- ---------------------------------------------------------------------
CREATE TABLE delivery_history (
    delivery_history_id  BIGSERIAL PRIMARY KEY,
    delivery_id            BIGINT NOT NULL REFERENCES delivery(delivery_id),
    user_id                 UUID NOT NULL REFERENCES app_user(user_id),
    delivery_status_id     UUID NOT NULL REFERENCES delivery_status(delivery_status_id),
    description             TEXT,
    latitude                NUMERIC(10,7),
    longitude               NUMERIC(10,7),
    created_at              TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_delivery_history_delivery ON delivery_history(delivery_id);

-- ---------------------------------------------------------------------
-- attachment  (NEW -- required by UC-15: photo/signature)
-- ---------------------------------------------------------------------
CREATE TABLE attachment (
    attachment_id     BIGSERIAL PRIMARY KEY,
    delivery_id         BIGINT NOT NULL REFERENCES delivery(delivery_id),
    attachment_type     VARCHAR(20) NOT NULL CHECK (attachment_type IN ('PHOTO', 'SIGNATURE')),
    file_url            TEXT NOT NULL,
    uploaded_by         UUID REFERENCES app_user(user_id),
    created_at          TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachment_delivery ON attachment(delivery_id);

-- ---------------------------------------------------------------------
-- audit_log  (see migration 000007)
--
-- One row per INSERT/UPDATE/DELETE on any business table, written by an
-- AFTER trigger (log_row_change). No application code reads it yet — it is
-- here so every modification has a timestamp and, when the API sets
-- `app.user_id` on its transaction, an author. `changed_by` is deliberately
-- NOT a foreign key: the audit trail must outlive the rows it references.
-- ---------------------------------------------------------------------
CREATE TABLE audit_log (
    audit_log_id  BIGSERIAL PRIMARY KEY,
    table_name    TEXT        NOT NULL,
    row_pk        TEXT        NOT NULL,
    action        TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_row       JSONB,
    new_row       JSONB,
    changed_by    UUID,
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_log_table_row  ON audit_log(table_name, row_pk);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX idx_audit_log_changed_by ON audit_log(changed_by);

-- =====================================================================
-- Example trigger sketch for a business rule that can't be expressed
-- as a plain CHECK constraint (needs a join to delivery_status):
--   "If requiresObservation = TRUE, notes cannot be empty."
-- =====================================================================
-- CREATE OR REPLACE FUNCTION enforce_observation_required()
-- RETURNS TRIGGER AS $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM delivery_status ds
--     WHERE ds.delivery_status_id = NEW.delivery_status_id
--       AND ds.requires_observation = TRUE
--   ) AND (NEW.notes IS NULL OR trim(NEW.notes) = '') THEN
--     RAISE EXCEPTION 'notes is required for this delivery status';
--   END IF;
--   RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;
--
-- CREATE TRIGGER trg_enforce_observation
-- BEFORE INSERT OR UPDATE ON delivery
-- FOR EACH ROW EXECUTE FUNCTION enforce_observation_required();
