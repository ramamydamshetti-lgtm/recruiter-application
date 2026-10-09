CREATE TABLE IF NOT EXISTS "email_ingestion_events" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "graph_message_id" TEXT,
    "internet_message_id" TEXT,
    "source" TEXT NOT NULL DEFAULT 'EMAIL_AUTOMATION',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_message" TEXT,
    "requirement_pk" TEXT,
    "requirement_code" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "email_ingestion_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_ingestion_events_idempotency_key_key"
    ON "email_ingestion_events"("idempotency_key");

CREATE INDEX IF NOT EXISTS "email_ingestion_events_graph_message_id_idx"
    ON "email_ingestion_events"("graph_message_id");

CREATE INDEX IF NOT EXISTS "email_ingestion_events_status_idx"
    ON "email_ingestion_events"("status");
