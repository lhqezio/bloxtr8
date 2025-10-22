// // src/prisma/seed.ts

// import { prisma, GuildRole, KycTier } from './index.js';
// const randomId = () => Math.random().toString(36).substring(2);

// async function main() {
//   console.log('🔥 Deleting existing data...');
//   // Delete in an order that respects foreign key constraints
//   await prisma.webhookEvent.deleteMany();
//   await prisma.auditLog.deleteMany();
//   await prisma.robloxSnapshot.deleteMany();
//   await prisma.dispute.deleteMany();
//   await prisma.delivery.deleteMany();
//   await prisma.milestoneEscrow.deleteMany();
//   await prisma.stablecoinEscrow.deleteMany();
//   await prisma.stripeEscrow.deleteMany();
//   await prisma.escrow.deleteMany();
//   await prisma.signature.deleteMany();
//   await prisma.contract.deleteMany();
//   await prisma.offer.deleteMany();
//   await prisma.listing.deleteMany();
//   await prisma.guildMember.deleteMany();
//   await prisma.guild.deleteMany();
//   await prisma.user.deleteMany();
//   console.log('✅ Previous data deleted.');

//   console.log('🌱 Seeding database...');

//   // --- USERS ---
//   console.log('Creating users...');
//   const alice = await prisma.user.create({
//     data: {
//       name: 'Alice',
//       email: 'alice@example.com',
//       walletAddress: '0xAliceWalletAddress',
//       kycTier: KycTier.TIER_2,
//       kycVerified: true,
//     },
//   });

//   const bob = await prisma.user.create({
//     data: {
//       name: 'Bob',
//       email: 'bob@example.com',
//       walletAddress: '0xBobWalletAddress',
//     },
//   });

//   const charlie = await prisma.user.create({
//     data: {
//       name: 'Charlie',
//       email: 'charlie@example.com',
//       walletAddress: '0xCharlieSanctionedWallet',
//       walletRisk: 'SANCTIONED',
//     },
//   });

//   const diane = await prisma.user.create({
//     data: {
//       name: 'Diane',
//       email: 'diane@example.com',
//     },
//   });

//   // Add verified user for testing Discord bot
//   const verifiedUser = await prisma.user.create({
//     data: {
//       name: 'VerifiedUser',
//       email: 'verified@example.com',
//       phone: '+1234567890',
//       walletAddress: '0xVerifiedUserWallet',
//       kycTier: KycTier.TIER_2,
//       kycVerified: true,
//       walletRisk: 'LOW',
//     },
//   });

//   // Add second verified user for testing Discord bot
//   const verifiedUser2 = await prisma.user.create({
//     data: {
//       name: 'VerifiedUser2',
//       email: 'verified2@example.com',
//       phone: '+1234567891',
//       walletAddress: '0xVerifiedUser2Wallet',
//       kycTier: KycTier.TIER_2,
//       kycVerified: true,
//       walletRisk: 'LOW',
//     },
//   });

//   // Create Discord account records for users
//   await prisma.account.createMany({
//     data: [
//       {
//         id: 'discord_alice_discord_123',
//         accountId: 'alice_discord_123',
//         providerId: 'discord',
//         userId: alice.id,
//       },
//       {
//         id: 'discord_bob_discord_456',
//         accountId: 'bob_discord_456',
//         providerId: 'discord',
//         userId: bob.id,
//       },
//       {
//         id: 'discord_charlie_discord_789',
//         accountId: 'charlie_discord_789',
//         providerId: 'discord',
//         userId: charlie.id,
//       },
//       {
//         id: 'discord_diane_discord_101',
//         accountId: 'diane_discord_101',
//         providerId: 'discord',
//         userId: diane.id,
//       },
//       {
//         id: 'discord_426540459599593472',
//         accountId: '426540459599593472',
//         providerId: 'discord',
//         userId: verifiedUser.id,
//       },
//       {
//         id: 'discord_622492102042976271',
//         accountId: '622492102042976271',
//         providerId: 'discord',
//         userId: verifiedUser2.id,
//       },
//     ],
//   });

//   // --- GUILDS ---
//   console.log('Creating guilds and memberships...');
//   const robloxTradersGuild = await prisma.guild.create({
//     data: {
//       discordId: 'roblox_traders_guild_789',
//       name: 'Roblox Traders Guild',
//       description: 'A community of trusted Roblox game traders',
//       members: {
//         create: [
//           { userId: alice.id, role: GuildRole.OWNER },
//           { userId: bob.id, role: GuildRole.MEMBER },
//           { userId: charlie.id, role: GuildRole.MODERATOR },
//         ],
//       },
//     },
//   });

//   const gameDevsGuild = await prisma.guild.create({
//     data: {
//       discordId: 'game_devs_guild_456',
//       name: 'Game Devs Hub',
//       description: 'A place for Roblox developers to collaborate.',
//       members: {
//         create: [
//           { userId: diane.id, role: GuildRole.ADMIN },
//           { userId: alice.id, role: GuildRole.MEMBER },
//           { userId: verifiedUser.id, role: GuildRole.MEMBER },
//         ],
//       },
//     },
//   });

//   // Add the actual Discord server where the bot is running
//   await prisma.guild.create({
//     data: {
//       discordId: '1417568662021472531',
//       name: 'Bloxtr8 Discord Server',
//       description: 'Main Discord server for Bloxtr8 platform',
//       members: {
//         create: [
//           { userId: verifiedUser.id, role: GuildRole.ADMIN },
//           { userId: verifiedUser2.id, role: GuildRole.ADMIN },
//         ],
//       },
//     },
//   });

//   // --- SCENARIO 1: Successful Stripe Transaction ---
//   console.log('Creating Scenario 1: Successful Stripe Transaction...');
//   const listingSword = await prisma.listing.create({
//     data: {
//       title: 'Legendary Roblox Sword',
//       summary: 'A rare, powerful sword from an old event. One of a kind.',
//       price: 5000, // $50.00
//       category: 'Items',
//       status: 'ACTIVE',
//       userId: alice.id,
//       guildId: robloxTradersGuild.id,
//       robloxSnapshots: {
//         create: {
//           gameId: 'game_123456789',
//           gameName: 'Epic Adventure Game',
//           gameDescription: 'An amazing Roblox adventure game',
//           playerCount: 150,
//           visits: 50000,
//           createdDate: new Date('2023-01-15'),
//           verifiedOwnership: true,
//           ownershipType: 'OWNER',
//           verificationDate: new Date(),
//           metadata: { genre: 'Adventure', rating: 4.8 },
//         },
//       },
//     },
//   });

//   const offerForSword = await prisma.offer.create({
//     data: {
//       amount: 5000,
//       currency: 'USD',
//       expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week
//       status: 'ACCEPTED',
//       listingId: listingSword.id,
//       buyerId: bob.id,
//       sellerId: alice.id,
//     },
//   });

//   const contractForSword = await prisma.contract.create({
//     data: {
//       offerId: offerForSword.id,
//       status: 'EXECUTED',
//       pdfUrl: 'https://example.com/contracts/sword_contract.pdf',
//       sha256: 'a1b2c3d4e5f6...',
//       signatures: {
//         create: [{ userId: alice.id }, { userId: bob.id }],
//       },
//     },
//   });

//   const escrowForSword = await prisma.escrow.create({
//     data: {
//       offerId: offerForSword.id,
//       contractId: contractForSword.id,
//       rail: 'STRIPE',
//       amount: 5000,
//       currency: 'USD',
//       status: 'RELEASED',
//       stripeEscrow: {
//         create: {
//           paymentIntentId: `pi_${randomId()}`,
//           transferId: `tr_${randomId()}`,
//         },
//       },
//     },
//   });

//   await prisma.delivery.create({
//     data: {
//       title: 'Delivery of Legendary Sword',
//       description: 'Item transferred in-game.',
//       status: 'CONFIRMED',
//       deliveredAt: new Date(),
//       listingId: listingSword.id,
//       offerId: offerForSword.id,
//       contractId: contractForSword.id,
//       escrowId: escrowForSword.id,
//       deliveredBy: alice.id,
//     },
//   });

//   await prisma.listing.update({
//     where: { id: listingSword.id },
//     data: { status: 'SOLD' },
//   });

//   // --- SCENARIO 2: Disputed USDC Transaction ---
//   console.log('Creating Scenario 2: Disputed USDC Transaction...');
//   const listingGame = await prisma.listing.create({
//     data: {
//       title: 'Obby Game For Sale',
//       summary: 'Fully scripted obby game with 100 stages.',
//       price: 25000, // $250.00
//       category: 'Games',
//       userId: diane.id,
//       guildId: gameDevsGuild.id,
//     },
//   });

//   const offerForGame = await prisma.offer.create({
//     data: {
//       amount: 24000,
//       currency: 'USDC',
//       expiry: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
//       status: 'ACCEPTED',
//       listingId: listingGame.id,
//       buyerId: alice.id,
//       sellerId: diane.id,
//     },
//   });

//   const contractForGame = await prisma.contract.create({
//     data: {
//       offerId: offerForGame.id,
//       status: 'EXECUTED',
//       signatures: { create: [{ userId: alice.id }, { userId: diane.id }] },
//     },
//   });

//   const escrowForGame = await prisma.escrow.create({
//     data: {
//       offerId: offerForGame.id,
//       contractId: contractForGame.id,
//       rail: 'USDC_BASE',
//       amount: 24000,
//       currency: 'USDC',
//       status: 'DISPUTED',
//       stablecoinEscrow: {
//         create: {
//           chain: 'BASE',
//           depositAddr: '0xDepositAddressForGame',
//           depositTx: '0xDepositTxHash',
//         },
//       },
//     },
//   });

//   await prisma.delivery.create({
//     data: {
//       title: 'Delivery of Obby Game',
//       description: 'Transferred ownership of the Roblox place.',
//       status: 'REJECTED',
//       deliveredAt: new Date(),
//       listingId: listingGame.id,
//       offerId: offerForGame.id,
//       contractId: contractForGame.id,
//       escrowId: escrowForGame.id,
//       deliveredBy: diane.id,
//     },
//   });

//   await prisma.dispute.create({
//     data: {
//       title: 'Game not as described',
//       description:
//         'The game was missing half of the advertised stages and had free models.',
//       status: 'IN_REVIEW',
//       escrowId: escrowForGame.id,
//       userId: alice.id, // Dispute initiated by the buyer
//     },
//   });

//   // --- SCENARIO 3: Counter-Offer & Milestone Escrow ---
//   console.log('Creating Scenario 3: Counter-Offer & Milestone Escrow...');
//   const listingProject = await prisma.listing.create({
//     data: {
//       title: 'Full Game Development Project',
//       summary: 'Need a developer to build a new tycoon game from scratch.',
//       price: 100000, // $1000.00
//       category: 'Services',
//       userId: bob.id, // Bob is looking to hire
//       guildId: gameDevsGuild.id,
//     },
//   });

//   const initialOffer = await prisma.offer.create({
//     data: {
//       amount: 80000,
//       currency: 'USD',
//       expiry: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
//       conditions: 'I can do it for $800, but with a 6-week timeline.',
//       status: 'COUNTERED',
//       listingId: listingProject.id,
//       buyerId: diane.id, // Diane is the developer offering her service
//       sellerId: bob.id, // Bob is the client
//     },
//   });

//   const counterOffer = await prisma.offer.create({
//     data: {
//       amount: 90000,
//       currency: 'USD',
//       expiry: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
//       conditions:
//         'Meet me at $900 with a 5-week timeline, payment in 3 milestones.',
//       status: 'ACCEPTED',
//       listingId: listingProject.id,
//       buyerId: bob.id,
//       sellerId: diane.id,
//       parentId: initialOffer.id, // This is a counter to the initial offer
//     },
//   });

//   const contractForProject = await prisma.contract.create({
//     data: {
//       offerId: counterOffer.id,
//       status: 'EXECUTED',
//       signatures: { create: [{ userId: bob.id }, { userId: diane.id }] },
//     },
//   });

//   const escrowForProject = await prisma.escrow.create({
//     data: {
//       offerId: counterOffer.id,
//       contractId: contractForProject.id,
//       rail: 'STRIPE',
//       amount: 90000,
//       currency: 'USD',
//       status: 'FUNDS_HELD', // Part of the funds are held
//     },
//   });

//   await prisma.milestoneEscrow.createMany({
//     data: [
//       {
//         title: 'Milestone 1: UI & Core Scripts',
//         amountCents: 30000,
//         status: 'RELEASED',
//         escrowId: escrowForProject.id,
//       },
//       {
//         title: 'Milestone 2: Map & Asset Creation',
//         amountCents: 30000,
//         status: 'FUNDS_HELD',
//         escrowId: escrowForProject.id,
//       },
//       {
//         title: 'Milestone 3: Final Polish & Delivery',
//         amountCents: 30000,
//         status: 'AWAIT_FUNDS', // Client hasn't funded this part yet
//         escrowId: escrowForProject.id,
//       },
//     ],
//   });

//   // --- SCENARIO 4: Expired and Declined Offers ---
//   console.log('Creating Scenario 4: Expired and Declined Offers...');
//   const inactiveListing = await prisma.listing.create({
//     data: {
//       title: 'Vintage Roblox Hat',
//       summary: 'A hat from 2010. No longer on sale.',
//       price: 1500,
//       category: 'Items',
//       status: 'INACTIVE',
//       userId: charlie.id,
//     },
//   });

//   await prisma.offer.create({
//     data: {
//       amount: 1200,
//       currency: 'USD',
//       expiry: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // Expired yesterday
//       status: 'EXPIRED',
//       listingId: inactiveListing.id,
//       buyerId: bob.id,
//       sellerId: charlie.id,
//     },
//   });

//   await prisma.offer.create({
//     data: {
//       amount: 1000,
//       currency: 'USD',
//       expiry: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
//       status: 'DECLINED',
//       listingId: inactiveListing.id,
//       buyerId: alice.id,
//       sellerId: charlie.id,
//     },
//   });

//   // --- SUPPORTING DATA ---
//   console.log('Creating audit logs and webhook events...');
//   await prisma.auditLog.createMany({
//     data: [
//       {
//         action: 'USER_CREATED',
//         details: { username: alice.name },
//         userId: alice.id,
//       },
//       {
//         action: 'ESCROW_FUNDS_RELEASED',
//         details: { amount: 5000, currency: 'USD', recipient: bob.name },
//         escrowId: escrowForSword.id,
//         userId: alice.id, // Action performed by Alice
//       },
//       {
//         action: 'DISPUTE_OPENED',
//         details: { reason: 'Game not as described' },
//         escrowId: escrowForGame.id,
//         userId: alice.id,
//       },
//     ],
//   });

//   await prisma.webhookEvent.createMany({
//     data: [
//       {
//         eventId: `evt_${randomId()}`,
//         provider: 'stripe',
//         processed: true,
//       },
//       {
//         eventId: `evt_${randomId()}`,
//         provider: 'custodian_base',
//         processed: true,
//       },
//       {
//         eventId: `evt_${randomId()}`,
//         provider: 'stripe',
//         processed: false,
//       },
//     ],
//   });

//   console.log('✅ Database seeded successfully!');
// }

// main()
//   .catch(err => {
//     console.error('An error occurred while seeding the database:', err);
//     process.exit(1);
//   })
//   .finally(async () => {
//     await prisma.$disconnect();
//   });
