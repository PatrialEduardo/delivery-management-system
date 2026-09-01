-- Reverse of 000001_init_schema.up.sql. Dropped in FK-dependency order;
-- CASCADE covers the indexes and any objects that reference each table.

DROP TABLE IF EXISTS attachment CASCADE;
DROP TABLE IF EXISTS delivery_history CASCADE;
DROP TABLE IF EXISTS delivery_product CASCADE;
DROP TABLE IF EXISTS delivery CASCADE;
DROP TABLE IF EXISTS delivery_batch CASCADE;
DROP TABLE IF EXISTS delivery_status CASCADE;
DROP TABLE IF EXISTS product CASCADE;
DROP TABLE IF EXISTS address CASCADE;
DROP TABLE IF EXISTS customer CASCADE;
DROP TABLE IF EXISTS app_user CASCADE;
DROP TABLE IF EXISTS role CASCADE;
DROP TABLE IF EXISTS company CASCADE;
