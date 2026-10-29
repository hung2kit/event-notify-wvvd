CREATE TABLE "announcement_groups" (
	"announcement_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "announcement_groups_announcement_id_group_id_pk" PRIMARY KEY("announcement_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text NOT NULL,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"start_at" timestamp NOT NULL,
	"frequency" text NOT NULL,
	"until_date" date,
	"rrule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "announcements_frequency_check" CHECK ("announcements"."frequency" in ('none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly'))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"announcement_id" uuid,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" in ('create', 'edit', 'toggle', 'delete', 'test_send'))
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"announcement_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_message_id" text,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "deliveries_status_check" CHECK ("deliveries"."status" in ('queued', 'sending', 'sent', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE TABLE "recipient_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"email_address" text NOT NULL,
	"member_count" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduler_state" (
	"id" text PRIMARY KEY NOT NULL,
	"last_tick_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('admin', 'editor', 'viewer'))
);
--> statement-breakpoint
ALTER TABLE "announcement_groups" ADD CONSTRAINT "announcement_groups_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_groups" ADD CONSTRAINT "announcement_groups_group_id_recipient_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."recipient_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcements_due_idx" ON "announcements" USING btree ("next_run_at") WHERE "announcements"."is_active" = true AND "announcements"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "audit_log_announcement_idx" ON "audit_log" USING btree ("announcement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_announcement_scheduled_unique" ON "deliveries" USING btree ("announcement_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "deliveries_scheduled_for_idx" ON "deliveries" USING btree ("scheduled_for");--> statement-breakpoint
CREATE UNIQUE INDEX "recipient_groups_email_unique" ON "recipient_groups" USING btree ("email_address");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");