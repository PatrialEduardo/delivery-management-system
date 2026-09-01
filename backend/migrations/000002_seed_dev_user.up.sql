-- Dev-only seed: gives you an account to log in with straight after
-- `migrate up`. Do NOT run this against staging/production.
--
-- Login:  patrialeduardo@gmail.com  /  Password123!
-- The password_hash below is bcrypt (cost 10). Regenerate with:
--   go run ./scripts/hash_password.go "Password123!"

INSERT INTO company (company_id, company_name, trade_name, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Dev Company', 'Dev Co', TRUE)
ON CONFLICT (company_id) DO NOTHING;

INSERT INTO role (role_id, role_name, description, is_active)
VALUES ('00000000-0000-0000-0000-000000000010', 'Admin', 'Full administrative access', TRUE)
ON CONFLICT (role_id) DO NOTHING;

INSERT INTO app_user (
    user_id, company_id, role_id, full_name, email, password_hash, is_active
)
VALUES (
    '00000000-0000-0000-0000-000000000100',
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000010',
    'Patrial Eduardo',
    'patrialeduardo@gmail.com',
    '$2a$10$YJ/WdlipAFq2XG66VIK.iOdyGL2GwFgBUCnGBLlRVss3eGuVKHQH2',
    TRUE
)
ON CONFLICT (email) DO NOTHING;
