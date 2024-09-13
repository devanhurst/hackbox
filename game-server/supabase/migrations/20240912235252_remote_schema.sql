alter table "public"."members" add column "online" boolean not null default false;

alter table "public"."messages" drop column "member_id";

alter table "public"."messages" drop column "received_at";


