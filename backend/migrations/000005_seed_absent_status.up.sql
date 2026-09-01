-- "Absent client" is a distinct terminal outcome from a generic failure,
-- so the dispatcher board can tell them apart. Sits between Delivered and
-- Failed in the summary strip.

INSERT INTO delivery_status
  (status_code, status_name, status_type, description, color_hex, icon, display_order,
   requires_observation, allows_reschedule, finishes_delivery, is_active)
VALUES
  ('ABSENT', 'Absent client', 'RESULT', 'Nobody available to receive it',
   '#b45309', 'user-x', 45, false, true, true, true)
ON CONFLICT (status_code) DO NOTHING;
