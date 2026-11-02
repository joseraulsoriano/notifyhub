CREATE TABLE "provider_dispatch_lease" (
    "lease_id" UUID NOT NULL,
    "queue_position" BIGSERIAL NOT NULL,
    "provider_code" TEXT NOT NULL,
    "notification_id" UUID NOT NULL,
    "queue_name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acquired_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "provider_dispatch_lease_pkey" PRIMARY KEY ("lease_id"),
    CONSTRAINT "provider_dispatch_lease_queue_position_key" UNIQUE ("queue_position"),
    CONSTRAINT "provider_dispatch_lease_status_check" CHECK ("status" IN ('ACTIVE', 'WAITING'))
);

CREATE INDEX "provider_dispatch_lease_provider_status_created_idx"
    ON "provider_dispatch_lease"("provider_code", "status", "created_at");
CREATE INDEX "provider_dispatch_lease_provider_status_position_idx"
    ON "provider_dispatch_lease"("provider_code", "status", "queue_position");
CREATE INDEX "provider_dispatch_lease_expires_at_idx"
    ON "provider_dispatch_lease"("expires_at");
CREATE INDEX "provider_dispatch_lease_notification_id_idx"
    ON "provider_dispatch_lease"("notification_id");

ALTER TABLE "provider_dispatch_lease"
    ADD CONSTRAINT "provider_dispatch_lease_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notification"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "notification_dispatch_claim" (
    "lease_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_dispatch_claim_pkey" PRIMARY KEY ("lease_id"),
    CONSTRAINT "notification_dispatch_claim_notification_id_key" UNIQUE ("notification_id")
);

CREATE INDEX "notification_dispatch_claim_expires_at_idx"
    ON "notification_dispatch_claim"("expires_at");

ALTER TABLE "notification_dispatch_claim"
    ADD CONSTRAINT "notification_dispatch_claim_notification_id_fkey"
    FOREIGN KEY ("notification_id") REFERENCES "notification"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
