CREATE TABLE IF NOT EXISTS "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"room_code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"user_name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"state" json,
	"online" boolean DEFAULT false NOT NULL,
	"metadata" json
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rooms" (
	"code" text PRIMARY KEY,
	"host_id" uuid NOT NULL,
	"persistent" boolean DEFAULT false,
	"closed" boolean DEFAULT false NOT NULL,
	"twitch_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
