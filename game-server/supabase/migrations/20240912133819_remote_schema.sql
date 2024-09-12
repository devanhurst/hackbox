alter table "public"."messages" drop constraint "messages_member_id_fkey";

alter table "public"."messages" alter column "created_at" drop not null;

alter table "public"."messages" alter column "received_at" drop not null;


