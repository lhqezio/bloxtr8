/*
  Warnings:

  - You are about to drop the column `discordId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `username` on the `users` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."users_discordId_idx";

-- DropIndex
DROP INDEX "public"."users_discordId_key";

-- AlterTable
ALTER TABLE "public"."users" DROP COLUMN "discordId",
DROP COLUMN "username";
