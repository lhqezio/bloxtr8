import { PrismaClient } from "@bloxtr8/database";
import { config } from '@dotenvx/dotenvx';
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
config();


const prisma = new PrismaClient();
export const auth = betterAuth({
    database: prismaAdapter(prisma, {
        provider: "postgresql", // or "mysql", "sqlite", ...etc
    }),
    emailAndPassword:{
        enabled: false,
    },
    socialProviders: {
        discord: { 
            clientId: process.env.DISCORD_CLIENT_ID as string, 
            clientSecret: process.env.DISCORD_CLIENT_SECRET as string, 
            permissions: 2048 | 16384, // Send Messages + Embed Links
            // Read more about the permission here: https://www.better-auth.com/docs/authentication/discord#:~:text=If%20you%27re%20using%20the%20bot%20scope%20with%20Discord%20OAuth%2C%20you%20can%20specify%20bot%20permissions%20using%20the%20permissions%20option.%20It%20can%20either%20be%20a%20bitwise%20value%20(e.g%202048%20%7C%2016384%20for%20Send%20Messages%20and%20Embed%20Links)%20or%20a%20specific%20permission%20value%20(e.g%2016384%20for%20Embed%20Links).

        }, 
    }
});