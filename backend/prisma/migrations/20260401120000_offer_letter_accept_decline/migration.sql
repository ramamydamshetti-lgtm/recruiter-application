-- AlterTable
ALTER TABLE "offer_letters" ADD COLUMN IF NOT EXISTS "accepted_joining_date" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "decline_reason" TEXT;
