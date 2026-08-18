-- Walk-in renters can leave a phone number.
--
-- A walk-in booking has no customer file, which meant no way to reach the
-- person at all — no number to call when the hearse is ready or the chairs are
-- due back. Optional on purpose: some walk-ins will not give one, and a booking
-- must never be blocked on it.
ALTER TABLE bookings ADD COLUMN renter_phone TEXT;
