-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_otp_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "login_otp_expires" TIMESTAMP(3);
