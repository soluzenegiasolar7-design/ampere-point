-- AlterTable
ALTER TABLE "work_days" ADD COLUMN     "odometerKmRetornoAlmoco" DOUBLE PRECISION,
ADD COLUMN     "odometerKmSaidaAlmoco" DOUBLE PRECISION,
ADD COLUMN     "odometerPhotoDataRetornoAlmoco" BYTEA,
ADD COLUMN     "odometerPhotoDataSaidaAlmoco" BYTEA,
ADD COLUMN     "odometerPhotoUrlRetornoAlmoco" TEXT,
ADD COLUMN     "odometerPhotoUrlSaidaAlmoco" TEXT;
