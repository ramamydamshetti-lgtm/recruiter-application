-- communication_logs

CREATE TYPE "CommunicationLogStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED');

CREATE TABLE "communication_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "status" "CommunicationLogStatus" NOT NULL,
    "provider_message_id" TEXT,
    "requirement_id" TEXT,
    "submission_id" TEXT,
    "body" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "communication_logs_requirement_id_idx" ON "communication_logs"("requirement_id");

CREATE INDEX "communication_logs_submission_id_idx" ON "communication_logs"("submission_id");

ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
