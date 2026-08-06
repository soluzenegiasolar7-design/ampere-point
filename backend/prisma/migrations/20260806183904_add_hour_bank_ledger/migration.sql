-- CreateEnum
CREATE TYPE "HourBankEntryType" AS ENUM ('DAYOFF_DEBIT', 'MANUAL_CREDIT', 'MANUAL_DEBIT');

-- CreateTable
CREATE TABLE "hour_bank_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "HourBankEntryType" NOT NULL,
    "minutes" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hour_bank_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hour_bank_entries_userId_date_idx" ON "hour_bank_entries"("userId", "date");

-- AddForeignKey
ALTER TABLE "hour_bank_entries" ADD CONSTRAINT "hour_bank_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
