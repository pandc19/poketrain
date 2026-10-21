-- Copying a user's data to the demo: the saved AI answers are unique per profile (a copy of a profile would
-- otherwise collide with the original), and the demo remembers when it was last copied.

-- DropIndex
DROP INDEX "ai_audits_kind_provider_input_hash_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "data_copied_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ai_audits_profile_id_kind_provider_input_hash_key" ON "ai_audits"("profile_id", "kind", "provider", "input_hash");

