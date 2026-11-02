ALTER TABLE "subscription"
    ADD COLUMN "client_app_id" UUID;

CREATE INDEX "subscription_client_app_id_subscriber_name_idx"
    ON "subscription"("client_app_id", "subscriber_name");

ALTER TABLE "subscription"
    ADD CONSTRAINT "subscription_client_app_id_fkey"
    FOREIGN KEY ("client_app_id") REFERENCES "client_app"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
