-- Audit / activity feed for requirements (RequirementActivity → requirement_activities)

CREATE TABLE "requirement_activities" (
    "id" TEXT NOT NULL,
    "requirement_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "requirement_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "requirement_activities_requirement_id_idx" ON "requirement_activities"("requirement_id");

ALTER TABLE "requirement_activities" ADD CONSTRAINT "requirement_activities_requirement_id_fkey" FOREIGN KEY ("requirement_id") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "requirement_activities" ADD CONSTRAINT "requirement_activities_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
