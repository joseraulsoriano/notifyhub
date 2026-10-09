-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS', 'PUSH', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENDING', 'RETRYING', 'FALLBACK', 'SENT', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('SENT', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "ProviderHealth" AS ENUM ('UP', 'DEGRADED', 'DOWN');

-- CreateTable
CREATE TABLE "client_app" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "api_key_hash" TEXT NOT NULL,
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 600,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_app_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification" (
    "id" UUID NOT NULL,
    "client_app_id" UUID NOT NULL,
    "idempotency_key" TEXT,
    "request_hash" TEXT NOT NULL,
    "sender" JSONB NOT NULL,
    "recipient" JSONB NOT NULL,
    "message" JSONB NOT NULL,
    "priority" "Priority" NOT NULL,
    "preferred_channel" "Channel" NOT NULL,
    "status" "NotificationStatus" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "cost_per_message" DECIMAL(10,5) NOT NULL,
    "reliability_score" INTEGER NOT NULL,
    "health" "ProviderHealth" NOT NULL DEFAULT 'UP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routing_rule" (
    "id" UUID NOT NULL,
    "priority" "Priority" NOT NULL,
    "channel" "Channel" NOT NULL,
    "provider_id" UUID NOT NULL,
    "rank" INTEGER NOT NULL,
    "fallback_channel" "Channel",

    CONSTRAINT "routing_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempt" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "provider_id" UUID NOT NULL,
    "channel" "Channel" NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "status" "AttemptStatus" NOT NULL,
    "provider_message_id" TEXT,
    "provider_response" JSONB,
    "error_code" TEXT,
    "latency_ms" INTEGER,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "notification_id" UUID NOT NULL,
    "attempt_id" UUID,
    "event_type" TEXT NOT NULL,
    "from_status" "NotificationStatus",
    "to_status" "NotificationStatus" NOT NULL,
    "channel" "Channel",
    "provider_code" TEXT,
    "detail" JSONB,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_event" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMPTZ(3),

    CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription" (
    "id" UUID NOT NULL,
    "subscriber_name" TEXT NOT NULL,
    "target_url" TEXT NOT NULL,
    "event_types" TEXT[],
    "secret_hash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_delivery" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "outbox_event_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMPTZ(3),

    CONSTRAINT "subscription_delivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_app_api_key_hash_key" ON "client_app"("api_key_hash");

-- CreateIndex
CREATE INDEX "notification_status_created_at_idx" ON "notification"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_client_app_id_idempotency_key_key" ON "notification"("client_app_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "provider_code_key" ON "provider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "routing_rule_priority_channel_rank_key" ON "routing_rule"("priority", "channel", "rank");

-- CreateIndex
CREATE INDEX "delivery_attempt_notification_id_attempt_number_idx" ON "delivery_attempt"("notification_id", "attempt_number");

-- CreateIndex
CREATE INDEX "audit_log_notification_id_occurred_at_idx" ON "audit_log"("notification_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at");

-- CreateIndex
CREATE INDEX "outbox_event_published_at_created_at_idx" ON "outbox_event"("published_at", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_delivery_subscription_id_outbox_event_id_key" ON "subscription_delivery"("subscription_id", "outbox_event_id");

-- AddForeignKey
ALTER TABLE "notification" ADD CONSTRAINT "notification_client_app_id_fkey" FOREIGN KEY ("client_app_id") REFERENCES "client_app"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routing_rule" ADD CONSTRAINT "routing_rule_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempt" ADD CONSTRAINT "delivery_attempt_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "provider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "delivery_attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outbox_event" ADD CONSTRAINT "outbox_event_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notification"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_delivery" ADD CONSTRAINT "subscription_delivery_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_delivery" ADD CONSTRAINT "subscription_delivery_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "outbox_event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

