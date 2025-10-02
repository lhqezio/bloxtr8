/*
  Warnings:

  - You are about to drop the column `groupId` on the `roblox_snapshots` table. All the data in the column will be lost.
  - You are about to drop the column `memberCount` on the `roblox_snapshots` table. All the data in the column will be lost.
  - You are about to drop the column `owner` on the `roblox_snapshots` table. All the data in the column will be lost.
  - Added the required column `assetId` to the `roblox_snapshots` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assetName` to the `roblox_snapshots` table without a default value. This is not possible if the table is not empty.
  - Added the required column `assetType` to the `roblox_snapshots` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('INVENTORY_API', 'ASSET_API', 'MANUAL');

-- DropIndex
DROP INDEX "public"."roblox_snapshots_groupId_idx";

-- AlterTable
ALTER TABLE "roblox_snapshots" DROP COLUMN "groupId",
DROP COLUMN "memberCount",
DROP COLUMN "owner",
ADD COLUMN     "assetDescription" TEXT,
ADD COLUMN     "assetId" TEXT NOT NULL,
ADD COLUMN     "assetName" TEXT NOT NULL,
ADD COLUMN     "assetType" TEXT NOT NULL,
ADD COLUMN     "copiesAvailable" INTEGER,
ADD COLUMN     "currentPrice" INTEGER,
ADD COLUMN     "originalPrice" INTEGER,
ADD COLUMN     "thumbnailUrl" TEXT,
ADD COLUMN     "totalCopies" INTEGER,
ADD COLUMN     "verificationDate" TIMESTAMP(3),
ADD COLUMN     "verifiedOwnership" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "link_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_verifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verificationMethod" "VerificationMethod" NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "link_tokens_token_key" ON "link_tokens"("token");

-- CreateIndex
CREATE INDEX "link_tokens_token_idx" ON "link_tokens"("token");

-- CreateIndex
CREATE INDEX "link_tokens_discordId_idx" ON "link_tokens"("discordId");

-- CreateIndex
CREATE INDEX "link_tokens_expiresAt_idx" ON "link_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "asset_verifications_userId_idx" ON "asset_verifications"("userId");

-- CreateIndex
CREATE INDEX "asset_verifications_assetId_idx" ON "asset_verifications"("assetId");

-- CreateIndex
CREATE INDEX "asset_verifications_verificationStatus_idx" ON "asset_verifications"("verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "asset_verifications_userId_assetId_key" ON "asset_verifications"("userId", "assetId");

-- CreateIndex
CREATE INDEX "roblox_snapshots_assetId_idx" ON "roblox_snapshots"("assetId");

-- CreateIndex
CREATE INDEX "roblox_snapshots_verifiedOwnership_idx" ON "roblox_snapshots"("verifiedOwnership");

-- CreateIndex
CREATE INDEX "roblox_snapshots_verificationDate_idx" ON "roblox_snapshots"("verificationDate");

-- AddForeignKey
ALTER TABLE "asset_verifications" ADD CONSTRAINT "asset_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
