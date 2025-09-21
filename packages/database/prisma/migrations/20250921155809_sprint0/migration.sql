-- CreateEnum
CREATE TYPE "public"."GuildRole" AS ENUM ('MEMBER', 'MODERATOR', 'ADMIN', 'OWNER');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."DisputeStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED');

-- AlterTable
ALTER TABLE "public"."listings" ADD COLUMN     "guildId" TEXT;

-- CreateTable
CREATE TABLE "public"."guilds" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."guild_members" (
    "id" TEXT NOT NULL,
    "role" "public"."GuildRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."deliveries" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "public"."DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "escrowId" TEXT NOT NULL,
    "deliveredBy" TEXT NOT NULL,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."disputes" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "public"."DisputeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "escrowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guilds_discordId_key" ON "public"."guilds"("discordId");

-- CreateIndex
CREATE INDEX "guilds_discordId_idx" ON "public"."guilds"("discordId");

-- CreateIndex
CREATE INDEX "guild_members_userId_idx" ON "public"."guild_members"("userId");

-- CreateIndex
CREATE INDEX "guild_members_guildId_idx" ON "public"."guild_members"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_members_userId_guildId_key" ON "public"."guild_members"("userId", "guildId");

-- CreateIndex
CREATE INDEX "deliveries_listingId_idx" ON "public"."deliveries"("listingId");

-- CreateIndex
CREATE INDEX "deliveries_offerId_idx" ON "public"."deliveries"("offerId");

-- CreateIndex
CREATE INDEX "deliveries_contractId_idx" ON "public"."deliveries"("contractId");

-- CreateIndex
CREATE INDEX "deliveries_escrowId_idx" ON "public"."deliveries"("escrowId");

-- CreateIndex
CREATE INDEX "deliveries_deliveredBy_idx" ON "public"."deliveries"("deliveredBy");

-- CreateIndex
CREATE INDEX "deliveries_status_idx" ON "public"."deliveries"("status");

-- CreateIndex
CREATE INDEX "disputes_escrowId_idx" ON "public"."disputes"("escrowId");

-- CreateIndex
CREATE INDEX "disputes_userId_idx" ON "public"."disputes"("userId");

-- CreateIndex
CREATE INDEX "disputes_status_idx" ON "public"."disputes"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "public"."audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_escrowId_idx" ON "public"."audit_logs"("escrowId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "public"."audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "public"."audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "contracts_offerId_idx" ON "public"."contracts"("offerId");

-- CreateIndex
CREATE INDEX "contracts_status_idx" ON "public"."contracts"("status");

-- CreateIndex
CREATE INDEX "escrows_offerId_idx" ON "public"."escrows"("offerId");

-- CreateIndex
CREATE INDEX "escrows_contractId_idx" ON "public"."escrows"("contractId");

-- CreateIndex
CREATE INDEX "escrows_status_idx" ON "public"."escrows"("status");

-- CreateIndex
CREATE INDEX "escrows_rail_idx" ON "public"."escrows"("rail");

-- CreateIndex
CREATE INDEX "listings_userId_idx" ON "public"."listings"("userId");

-- CreateIndex
CREATE INDEX "listings_guildId_idx" ON "public"."listings"("guildId");

-- CreateIndex
CREATE INDEX "listings_status_idx" ON "public"."listings"("status");

-- CreateIndex
CREATE INDEX "listings_category_idx" ON "public"."listings"("category");

-- CreateIndex
CREATE INDEX "milestone_escrows_escrowId_idx" ON "public"."milestone_escrows"("escrowId");

-- CreateIndex
CREATE INDEX "offers_listingId_idx" ON "public"."offers"("listingId");

-- CreateIndex
CREATE INDEX "offers_buyerId_idx" ON "public"."offers"("buyerId");

-- CreateIndex
CREATE INDEX "offers_sellerId_idx" ON "public"."offers"("sellerId");

-- CreateIndex
CREATE INDEX "offers_status_idx" ON "public"."offers"("status");

-- CreateIndex
CREATE INDEX "offers_expiry_idx" ON "public"."offers"("expiry");

-- CreateIndex
CREATE INDEX "roblox_snapshots_listingId_idx" ON "public"."roblox_snapshots"("listingId");

-- CreateIndex
CREATE INDEX "roblox_snapshots_groupId_idx" ON "public"."roblox_snapshots"("groupId");

-- CreateIndex
CREATE INDEX "signatures_userId_idx" ON "public"."signatures"("userId");

-- CreateIndex
CREATE INDEX "signatures_contractId_idx" ON "public"."signatures"("contractId");

-- CreateIndex
CREATE INDEX "users_discordId_idx" ON "public"."users"("discordId");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "users_walletAddress_idx" ON "public"."users"("walletAddress");

-- CreateIndex
CREATE INDEX "webhook_events_eventId_idx" ON "public"."webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "webhook_events_provider_idx" ON "public"."webhook_events"("provider");

-- CreateIndex
CREATE INDEX "webhook_events_processed_idx" ON "public"."webhook_events"("processed");

-- AddForeignKey
ALTER TABLE "public"."guild_members" ADD CONSTRAINT "guild_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."guild_members" ADD CONSTRAINT "guild_members_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."guilds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."listings" ADD CONSTRAINT "listings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "public"."guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "public"."escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_deliveredBy_fkey" FOREIGN KEY ("deliveredBy") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."disputes" ADD CONSTRAINT "disputes_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "public"."escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."disputes" ADD CONSTRAINT "disputes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
