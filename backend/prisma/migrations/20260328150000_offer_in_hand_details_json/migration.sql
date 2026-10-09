ALTER TABLE "candidates" ADD COLUMN IF NOT EXISTS "offer_in_hand_details" JSONB;
ALTER TABLE "submissions" ADD COLUMN IF NOT EXISTS "offer_in_hand_details" JSONB;
