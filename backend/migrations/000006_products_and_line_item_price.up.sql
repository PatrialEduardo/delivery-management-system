-- Line items per delivery/shipping.
--
-- 1. delivery_product.unit_price: the spec's delivery_product only had
--    quantity + notes. A line needs a price captured at the moment it is
--    added, so historical totals don't shift when the catalogue price of a
--    product changes later. Nullable for existing rows; the API always
--    writes it going forward.
-- 2. A small dev catalogue for "Dev Company" so the product screen and the
--    line-item grid have something to pick from on first load.

ALTER TABLE delivery_product
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2);

INSERT INTO product (product_id, company_id, product_name, sku, unit, price, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000001',
   'Água mineral 1,5L (fardo)', 'AGU-15-6',  'CX', 18.90, true),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000001',
   'Refrigerante 2L',           'REF-2L',    'UN',  9.50, true),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000001',
   'Cerveja lata 350ml (pack)', 'CER-350-12','CX', 42.00, true),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000001',
   'Botijão de gás P13',        'GAS-P13',   'UN', 120.00, true),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000001',
   'Galão de água 20L',         'AGU-20',    'UN', 12.00, true)
ON CONFLICT (product_id) DO NOTHING;
