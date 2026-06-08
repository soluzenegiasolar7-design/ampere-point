ALTER TABLE "time_entries"
  ADD COLUMN IF NOT EXISTS "odometerKm"        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "odometerPhotoData" BYTEA,
  ADD COLUMN IF NOT EXISTS "odometerPhotoUrl"  TEXT;
