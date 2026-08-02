CREATE TABLE "congressional_records" (
	"record_type" text NOT NULL,
	"record_key" text NOT NULL,
	"congress" integer NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"payload_hash" text NOT NULL,
	"provider_url" text NOT NULL,
	CONSTRAINT "congressional_records_record_type_record_key_pk" PRIMARY KEY("record_type","record_key")
);
--> statement-breakpoint
CREATE TABLE "record_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_type" text NOT NULL,
	"record_key" text NOT NULL,
	"occurred_on" text,
	"summary" text NOT NULL,
	"event_hash" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_bills" (
	"user_id" uuid NOT NULL,
	"congress" text NOT NULL,
	"bill_type" text NOT NULL,
	"bill_number" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_bills_user_id_congress_bill_type_bill_number_pk" PRIMARY KEY("user_id","congress","bill_type","bill_number")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"watermark" timestamp with time zone,
	"next_watermark" timestamp with time zone,
	"records_seen" integer DEFAULT 0 NOT NULL,
	"records_written" integer DEFAULT 0 NOT NULL,
	"events_appended" integer DEFAULT 0 NOT NULL,
	"requests_made" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "record_events" ADD CONSTRAINT "record_events_record_type_record_key_congressional_records_record_type_record_key_fk" FOREIGN KEY ("record_type","record_key") REFERENCES "public"."congressional_records"("record_type","record_key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_bills" ADD CONSTRAINT "saved_bills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "congressional_records_type_congress_idx" ON "congressional_records" USING btree ("record_type","congress","source_updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "record_events_hash_idx" ON "record_events" USING btree ("event_hash");--> statement-breakpoint
CREATE INDEX "record_events_record_idx" ON "record_events" USING btree ("record_type","record_key","occurred_on");--> statement-breakpoint
CREATE INDEX "saved_bills_user_created_idx" ON "saved_bills" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_runs_dataset_started_idx" ON "sync_runs" USING btree ("dataset","started_at");