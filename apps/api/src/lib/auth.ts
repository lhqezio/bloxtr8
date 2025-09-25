import { PrismaClient } from '@bloxtr8/database';
import { config } from '@dotenvx/dotenvx';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
config();

const prisma = new PrismaClient();
export const auth = betterAuth({
  trustedOrigins: ["http://localhost:5173", "http://localhost:3000"],

  database: prismaAdapter(prisma, {
    provider: 'postgresql', // or "mysql", "sqlite", ...etc
  }),
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmails: true,
      updateUserInfoOnLink: true,
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      disableSignUp: true,
      mapProfileToUser: (profile) => {
        return {
          image: profile.avatar_url, // only set if Discord has it
        }
      },
      scope: ['identify', 'email'],
      permissions: 2048 | 16384, // Send Messages + Embed Links
      // Read more about the permission here: https://www.better-auth.com/docs/authentication/discord
    },
    roblox: {
      clientId: process.env.ROBLOX_CLIENT_ID as string,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET as string,
      disableSignUp: true,
    },
  },
});
