alter table "public"."messages" add column "member_name" text;

alter table "public"."messages" add column "room_code" text;

alter table "public"."messages" add column "user_id" text;

alter table "public"."messages" alter column "member_id" drop not null;


