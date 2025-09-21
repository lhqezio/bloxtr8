// import { PrismaClient } from "@prisma/client";
import { PrismaClient } from './index.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create some users
  const alice = await prisma.user.create({
    data: {
      discordId: 'alice_discord_123',
      username: 'Alice',
      email: 'alice@example.com',
      walletAddress: '0xAliceWallet',
    },
  });

  const bob = await prisma.user.create({
    data: {
      discordId: 'bob_discord_456',
      username: 'Bob',
      email: 'bob@example.com',
      walletAddress: '0xBobWallet',
    },
  });

  // Create a guild
  const guild = await prisma.guild.create({
    data: {
      discordId: 'guild_discord_789',
      name: 'Roblox Traders Guild',
      description: 'A community of trusted Roblox game traders',
      members: {
        create: [
          { userId: alice.id, role: 'OWNER' },
          { userId: bob.id, role: 'MEMBER' },
        ],
      },
    },
    include: { members: true },
  });

  // Create a listing
  const listing = await prisma.listing.create({
    data: {
      title: 'Roblox Sword',
      summary: 'A rare Roblox sword item',
      price: 5000, // $50.00
      category: 'Roblox Items',
      userId: alice.id,
      guildId: guild.id,
    },
  });

  // Create an offer from Bob on Alice's listing
  await prisma.offer.create({
    data: {
      amount: 4500,
      currency: 'USD',
      expiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week from now
      listingId: listing.id,
      buyerId: bob.id,
      sellerId: alice.id,
    },
  });
  console.log('✅ Database seeded successfully!');
}

main()
  .catch(err => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
