ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "gpsToken" TEXT;
UPDATE "users" SET "gpsToken" = gen_random_uuid()::text WHERE "gpsToken" IS NULL;
ALTER TABLE "users" ALTER COLUMN "gpsToken" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "users_gpsToken_key" ON "users"("gpsToken");
