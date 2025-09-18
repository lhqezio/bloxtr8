-- CreateEnum
CREATE TYPE "public"."KycTier" AS ENUM ('TIER_1', 'TIER_2');

-- CreateEnum
CREATE TYPE "public"."WalletRisk" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH', 'SANCTIONED');

-- CreateEnum
CREATE TYPE "public"."ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SOLD');

-- CreateEnum
CREATE TYPE "public"."OfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'COUNTERED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."ContractStatus" AS ENUM ('PENDING_SIGNATURE', 'EXECUTED', 'VOID');

-- CreateEnum
CREATE TYPE "public"."EscrowRail" AS ENUM ('STRIPE', 'USDC_BASE');

-- CreateEnum
CREATE TYPE "public"."EscrowStatus" AS ENUM ('AWAIT_FUNDS', 'FUNDS_HELD', 'DELIVERED', 'RELEASED', 'DISPUTED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."Currency" AS ENUM ('USD', 'USDC');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "kycTier" "public"."KycTier" NOT NULL DEFAULT 'TIER_1',
    "kycVerified" BOOLEAN NOT NULL DEFAULT false,
    "walletAddress" TEXT,
    "walletRisk" "public"."WalletRisk" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."listings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "status" "public"."ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."offers" (
    "id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "public"."Currency" NOT NULL DEFAULT 'USD',
    "conditions" TEXT,
    "expiry" TIMESTAMP(3) NOT NULL,
    "status" "public"."OfferStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "listingId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "parentId" TEXT,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contracts" (
    "id" TEXT NOT NULL,
    "pdfUrl" TEXT,
    "sha256" TEXT,
    "status" "public"."ContractStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offerId" TEXT NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."signatures" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."escrows" (
    "id" TEXT NOT NULL,
    "rail" "public"."EscrowRail" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" "public"."Currency" NOT NULL DEFAULT 'USD',
    "status" "public"."EscrowStatus" NOT NULL DEFAULT 'AWAIT_FUNDS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "offerId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stripe_escrows" (
    "id" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "transferId" TEXT,
    "refundId" TEXT,
    "escrowId" TEXT NOT NULL,

    CONSTRAINT "stripe_escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stablecoin_escrows" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL DEFAULT 'BASE',
    "depositAddr" TEXT NOT NULL,
    "depositTx" TEXT,
    "releaseTx" TEXT,
    "escrowId" TEXT NOT NULL,

    CONSTRAINT "stablecoin_escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."milestone_escrows" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "public"."EscrowStatus" NOT NULL DEFAULT 'AWAIT_FUNDS',
    "escrowId" TEXT NOT NULL,

    CONSTRAINT "milestone_escrows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roblox_snapshots" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "listingId" TEXT,

    CONSTRAINT "roblox_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "escrowId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_discordId_key" ON "public"."users"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_userId_contractId_key" ON "public"."signatures"("userId", "contractId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_escrows_paymentIntentId_key" ON "public"."stripe_escrows"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_escrows_escrowId_key" ON "public"."stripe_escrows"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "stablecoin_escrows_escrowId_key" ON "public"."stablecoin_escrows"("escrowId");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_eventId_key" ON "public"."webhook_events"("eventId");

-- AddForeignKey
ALTER TABLE "public"."listings" ADD CONSTRAINT "listings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."offers" ADD CONSTRAINT "offers_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."offers" ADD CONSTRAINT "offers_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."offers" ADD CONSTRAINT "offers_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."offers" ADD CONSTRAINT "offers_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contracts" ADD CONSTRAINT "contracts_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."signatures" ADD CONSTRAINT "signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."signatures" ADD CONSTRAINT "signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escrows" ADD CONSTRAINT "escrows_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."escrows" ADD CONSTRAINT "escrows_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stripe_escrows" ADD CONSTRAINT "stripe_escrows_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "public"."escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."stablecoin_escrows" ADD CONSTRAINT "stablecoin_escrows_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "public"."escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."milestone_escrows" ADD CONSTRAINT "milestone_escrows_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "public"."escrows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."roblox_snapshots" ADD CONSTRAINT "roblox_snapshots_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_escrowId_fkey" FOREIGN KEY ("escrowId") REFERENCES "public"."escrows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
