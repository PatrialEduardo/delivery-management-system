DO $$
DECLARE
    tables TEXT[] := ARRAY[
        'company', 'role', 'app_user', 'customer', 'address', 'product',
        'delivery_status', 'delivery_batch', 'delivery', 'delivery_product',
        'delivery_history', 'attachment'
    ];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$s', t);
    END LOOP;
END $$;

DROP FUNCTION IF EXISTS log_row_change();
DROP TABLE IF EXISTS audit_log;
