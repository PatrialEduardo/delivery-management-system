-- Reference data: the delivery lifecycle statuses the UI renders as
-- badges and the homepage summary strip. PROCESS = in-flight, RESULT =
-- terminal. color_hex drives the badge colour; display_order drives the
-- summary strip order.

INSERT INTO delivery_status
  (status_code, status_name, status_type, description, color_hex, icon, display_order,
   requires_observation, allows_reschedule, finishes_delivery, is_active)
VALUES
  ('PENDING',     'Pending',     'PROCESS', 'Created, not started yet',   '#6b7280', 'clock',        10, false, false, false, true),
  ('ASSIGNED',    'Assigned',    'PROCESS', 'Assigned to a driver',       '#2563eb', 'user-check',   20, false, false, false, true),
  ('IN_TRANSIT',  'In transit',  'PROCESS', 'Out for delivery',           '#f59e0b', 'truck',        30, false, false, false, true),
  ('DELIVERED',   'Delivered',   'RESULT',  'Handed to the customer',     '#16a34a', 'check-circle', 40, false, false, true,  true),
  ('FAILED',      'Failed',      'RESULT',  'Could not be delivered',     '#dc2626', 'x-circle',     50, true,  true,  true,  true),
  ('RESCHEDULED', 'Rescheduled', 'RESULT',  'A new attempt was scheduled','#7c3aed', 'calendar',     60, true,  true,  true,  true)
ON CONFLICT (status_code) DO NOTHING;
