-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "syncError" TEXT,
ADD COLUMN     "syncStatus" TEXT;

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
