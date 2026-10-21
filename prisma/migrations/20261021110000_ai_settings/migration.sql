-- AI is set up by each user (provider, key, workspace, model); the server holds no AI key, so the per-user
-- switch for using it is gone.

-- AlterTable
ALTER TABLE "users" DROP COLUMN "ai_enabled",
ADD COLUMN     "ai_model" TEXT,
ADD COLUMN     "ai_workspace_id" TEXT;

