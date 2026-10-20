-- A user can bring their own AI key: the provider, the key encrypted, and its last four characters.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "ai_key_encrypted" TEXT,
ADD COLUMN     "ai_key_hint" TEXT,
ADD COLUMN     "ai_provider" TEXT;

