-- Ideas for the app, sent from the public suggestions page and read by the admin.

-- CreateTable
CREATE TABLE "feature_suggestions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "message" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "feature_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feature_suggestions_archived_at_created_at_idx" ON "feature_suggestions"("archived_at", "created_at");

-- AddForeignKey
ALTER TABLE "feature_suggestions" ADD CONSTRAINT "feature_suggestions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

