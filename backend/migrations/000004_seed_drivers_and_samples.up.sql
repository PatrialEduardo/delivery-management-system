-- Dev-only seed: a Driver role, three drivers, a few customers with
-- addresses, and two shippings dated for "today" so the homepage has
-- something to show on first load. Do NOT run against staging/production.
--
-- All seeded users share the same password as the dev admin: Password123!

-- Driver role -------------------------------------------------------------
INSERT INTO role (role_id, role_name, description, is_active)
VALUES ('00000000-0000-0000-0000-000000000011', 'Driver', 'Delivery driver', true)
ON CONFLICT (role_id) DO NOTHING;

-- Drivers ---------------------------------------------------------------
INSERT INTO app_user
  (user_id, company_id, role_id, full_name, email, password_hash, phone, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011', 'Bruno Dias',   'bruno.driver@dev.local',
   '$2a$10$YJ/WdlipAFq2XG66VIK.iOdyGL2GwFgBUCnGBLlRVss3eGuVKHQH2', '+55 11 98000-0201', true),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011', 'Marina Reis',  'marina.driver@dev.local',
   '$2a$10$YJ/WdlipAFq2XG66VIK.iOdyGL2GwFgBUCnGBLlRVss3eGuVKHQH2', '+55 11 98000-0202', true),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000011', 'Caio Nunes',   'caio.driver@dev.local',
   '$2a$10$YJ/WdlipAFq2XG66VIK.iOdyGL2GwFgBUCnGBLlRVss3eGuVKHQH2', '+55 11 98000-0203', true)
ON CONFLICT (user_id) DO NOTHING;

-- Customers -----------------------------------------------------------
INSERT INTO customer (customer_id, company_id, full_name, phone, is_active)
VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000001', 'Ana Paula Souza', '+55 11 90000-0001', true),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000001', 'Théo Almeida',    '+55 11 90000-0002', true),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000001', 'Duda Lima',       '+55 11 90000-0003', true),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000001', 'Marco Antônio',   '+55 11 90000-0004', true),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000001', 'Lia Fernandes',   '+55 11 90000-0005', true)
ON CONFLICT (customer_id) DO NOTHING;

INSERT INTO address (address_id, customer_id, zip_code, street, number, district, city, state)
VALUES
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', '01310-100', 'Av. Paulista',               '1000', 'Bela Vista',  'São Paulo', 'SP'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000302', '04538-133', 'Av. Brigadeiro Faria Lima',  '3477', 'Itaim Bibi',  'São Paulo', 'SP'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000303', '05424-060', 'R. Cardeal Arcoverde',       '1200', 'Pinheiros',   'São Paulo', 'SP'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000304', '04094-050', 'Av. Ibirapuera',             '2000', 'Moema',       'São Paulo', 'SP'),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000305', '02011-000', 'R. Voluntários da Pátria',   '500',  'Santana',     'São Paulo', 'SP')
ON CONFLICT (address_id) DO NOTHING;

-- Two shippings for today --------------------------------------------
INSERT INTO delivery_batch (company_id, driver_user_id, batch_code, delivery_date, notes)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000201', 'SHP-0001', CURRENT_DATE, 'Morning route — city center'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000202', 'SHP-0002', CURRENT_DATE, 'Afternoon route — south zone')
ON CONFLICT (company_id, batch_code) DO NOTHING;

-- Their deliveries. batch id / driver / status ids are looked up so we
-- don't depend on the BIGSERIAL values.
INSERT INTO delivery
  (company_id, delivery_batch_id, customer_id, address_id, driver_user_id,
   delivery_status_id, delivery_order, attempt_number)
SELECT
  '00000000-0000-0000-0000-000000000001',
  b.delivery_batch_id,
  v.customer_id,
  v.address_id,
  b.driver_user_id,
  s.delivery_status_id,
  v.ord,
  1
FROM (VALUES
  ('SHP-0001', '00000000-0000-0000-0000-000000000301'::uuid, '00000000-0000-0000-0000-000000000401'::uuid, 'IN_TRANSIT', 1),
  ('SHP-0001', '00000000-0000-0000-0000-000000000302'::uuid, '00000000-0000-0000-0000-000000000402'::uuid, 'PENDING',    2),
  ('SHP-0001', '00000000-0000-0000-0000-000000000303'::uuid, '00000000-0000-0000-0000-000000000403'::uuid, 'DELIVERED',  3),
  ('SHP-0002', '00000000-0000-0000-0000-000000000304'::uuid, '00000000-0000-0000-0000-000000000404'::uuid, 'PENDING',    1),
  ('SHP-0002', '00000000-0000-0000-0000-000000000305'::uuid, '00000000-0000-0000-0000-000000000405'::uuid, 'PENDING',    2)
) AS v(batch_code, customer_id, address_id, status_code, ord)
JOIN delivery_batch b
  ON b.company_id = '00000000-0000-0000-0000-000000000001'
 AND b.batch_code = v.batch_code
JOIN delivery_status s
  ON s.status_code = v.status_code
WHERE NOT EXISTS (
  SELECT 1 FROM delivery d WHERE d.delivery_batch_id = b.delivery_batch_id
);
