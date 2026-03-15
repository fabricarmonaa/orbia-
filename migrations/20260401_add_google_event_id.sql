ALTER TABLE "agenda_events" ADD COLUMN IF NOT EXISTS "google_event_id" varchar(255);
ALTER TABLE "agenda_events" ADD COLUMN IF NOT EXISTS "google_sync_enabled" boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_agenda_events_google_id" ON "agenda_events"("google_event_id");
