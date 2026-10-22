-- A last name beside the name, which is now the first name. Empty for the accounts that have none.

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "last_name" TEXT NOT NULL DEFAULT '';
