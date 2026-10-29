ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_check";--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "retry_of" uuid;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_retry_of_deliveries_id_fk" FOREIGN KEY ("retry_of") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_retry_of_idx" ON "deliveries" USING btree ("retry_of");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_check" CHECK ("audit_log"."action" in ('create', 'edit', 'toggle', 'delete', 'test_send', 'retry'));