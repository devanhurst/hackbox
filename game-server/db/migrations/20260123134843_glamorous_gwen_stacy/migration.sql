-- Add foreign key constraint with CASCADE
-- If this fails, there might be an existing constraint
-- In that case, manually drop it first with:
-- ALTER TABLE members DROP CONSTRAINT <constraint_name>;
ALTER TABLE "members" ADD CONSTRAINT "members_room_code_rooms_code_fkey" FOREIGN KEY ("room_code") REFERENCES "rooms"("code") ON DELETE CASCADE;