-- =====================================================================
-- 000007  audit_log
--
-- A generic change log: one row for every INSERT / UPDATE / DELETE on any
-- business table, written by an AFTER trigger. No application code reads it
-- yet — it exists so that literally every modification has a timestamp
-- (and, when the API sets `app.user_id` on its transaction, an author).
-- =====================================================================

CREATE TABLE audit_log (
    audit_log_id  BIGSERIAL PRIMARY KEY,
    table_name    TEXT        NOT NULL,
    row_pk        TEXT        NOT NULL,          -- primary key of the affected row, as text
    action        TEXT        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_row       JSONB,                         -- NULL for INSERT
    new_row       JSONB,                         -- NULL for DELETE
    changed_by    UUID,                          -- app_user.user_id when known; not an FK on purpose (audit outlives rows)
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_table_row  ON audit_log(table_name, row_pk);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at);
CREATE INDEX idx_audit_log_changed_by ON audit_log(changed_by);

-- The trigger function. TG_ARGV[0] is the name of the row's primary-key
-- column, passed when the trigger is attached below.
CREATE OR REPLACE FUNCTION log_row_change() RETURNS TRIGGER AS $$
DECLARE
    pk_col TEXT := TG_ARGV[0];
    actor  UUID := NULLIF(current_setting('app.user_id', true), '')::UUID;
    old_j  JSONB;
    new_j  JSONB;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        old_j := to_jsonb(OLD);
        INSERT INTO audit_log(table_name, row_pk, action, old_row, new_row, changed_by)
        VALUES (TG_TABLE_NAME, old_j ->> pk_col, 'DELETE', old_j, NULL, actor);
        RETURN OLD;

    ELSIF (TG_OP = 'UPDATE') THEN
        old_j := to_jsonb(OLD);
        new_j := to_jsonb(NEW);
        IF old_j = new_j THEN
            RETURN NEW;                          -- no-op update, nothing worth logging
        END IF;
        INSERT INTO audit_log(table_name, row_pk, action, old_row, new_row, changed_by)
        VALUES (TG_TABLE_NAME, new_j ->> pk_col, 'UPDATE', old_j, new_j, actor);
        RETURN NEW;

    ELSE -- INSERT
        new_j := to_jsonb(NEW);
        INSERT INTO audit_log(table_name, row_pk, action, old_row, new_row, changed_by)
        VALUES (TG_TABLE_NAME, new_j ->> pk_col, 'INSERT', NULL, new_j, actor);
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Attach it to every business table, pairing each with its PK column.
DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'company', 'role', 'app_user', 'customer', 'address', 'product',
        'delivery_status', 'delivery_batch', 'delivery', 'delivery_product',
        'delivery_history', 'attachment'
    ];
    pks TEXT[] := ARRAY[
        'company_id', 'role_id', 'user_id', 'customer_id', 'address_id', 'product_id',
        'delivery_status_id', 'delivery_batch_id', 'delivery_id', 'delivery_product_id',
        'delivery_history_id', 'attachment_id'
    ];
    i INT;
BEGIN
    FOR i IN 1 .. array_length(tables, 1) LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_audit_%1$s
             AFTER INSERT OR UPDATE OR DELETE ON %1$s
             FOR EACH ROW EXECUTE FUNCTION log_row_change(%2$L)',
            tables[i], pks[i]
        );
    END LOOP;
END $$;
