-- AlterTable
ALTER TABLE "time_entries" ALTER COLUMN "latitude" DROP NOT NULL,
ALTER COLUMN "longitude" DROP NOT NULL;

-- AlterTable
ALTER TABLE "work_days" ADD COLUMN     "odometerKmEntrada" DOUBLE PRECISION,
ADD COLUMN     "odometerPhotoDataEntrada" BYTEA,
ADD COLUMN     "odometerPhotoUrlEntrada" TEXT;
