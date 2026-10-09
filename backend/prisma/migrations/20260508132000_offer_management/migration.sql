-- offer_management

CREATE TABLE "offer_management" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "legacy_offer_letter_id" TEXT,
    "status" "OfferLetterStatus" NOT NULL DEFAULT 'DRAFT',
    "offered_ctc" DECIMAL(18,2),
    "currency" TEXT,
    "hr_notes" TEXT,
    "offer_expiry_date" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "declined_at" TIMESTAMP(3),
    "position_title" TEXT,
    "compensation" TEXT,
    "joining_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_management_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "offer_management_submission_id_key" ON "offer_management"("submission_id");

CREATE UNIQUE INDEX "offer_management_legacy_offer_letter_id_key" ON "offer_management"("legacy_offer_letter_id");

ALTER TABLE "offer_management" ADD CONSTRAINT "offer_management_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
