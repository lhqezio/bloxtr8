# Authentication System Spec

This document describes the authentication system for the bloxtr8 web-app using Better Auth. Users will:

- Sign up / sign in with email + password.
- Once signed in, they can link their Discord or Roblox accounts via OAuth.
- New accounts cannot be created from Discord or Roblox – only linked to existing accounts.
- After link Discord/Roblox account, they could use the sign in with Discord/Roblox button
- User call /verify from the discord bot -> redirect to linking page in the webapp -> oauth
## 1. Base Setup
```ts
import { betterAuth } from "better-auth"

export const auth = betterAuth({
  account: {
    accountLinking: {
      enabled: true,          // Allow linking after login
      allowDifferentEmails: false, // Only allow linking if emails match
      updateUserInfoOnLink: true,  // Sync user info when linking
    }
  },
  socialProviders: {
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID as string,
      clientSecret: process.env.DISCORD_CLIENT_SECRET as string,
      disableSignUp: true, // prevents creating new accounts
      // optional: permissions if bot scope is included
      permissions: 2048 | 16384, 
    },
    roblox: {
      clientId: process.env.ROBLOX_CLIENT_ID as string,
      clientSecret: process.env.ROBLOX_CLIENT_SECRET as string,
      disableSignUp: true, // prevents creating new accounts
    },
  },
})
```


## 2. Email + Password Auth
Sign Up
```ts
await authClient.signUp.email({
  email: "user@example.com",
  password: "strongpassword123",
  name: "Alice"
})
```
Sign In
```ts
await authClient.signIn.email({
  email: "user@example.com",
  password: "strongpassword123",
})
```



## 3. Linking Accounts
Client-Side Linking

Once logged in, a user can link Discord or Roblox:
```ts
// Link Discord
await authClient.linkSocial({
  provider: "discord",
})

// Link Roblox
await authClient.linkSocial({
  provider: "roblox",
})
```

Optional parameters for linkSocial:

- callbackURL?: string – Redirect URL after linking
- scopes?: string[] – Request additional permissions
- idToken?: { token: string; nonce?: string; accessToken?: string; refreshToken?: string } – Direct token linking
## 4. Authorization
#### Scenario:
A user has an account and has linked both discord and roblox. A user record will be created with id 123, in the account table there will be 2 records with this userId. One will has providerId: discord, accountId: {actual discord user id} -> remove discordId column from the user table.
<br>
Then when the discord bot run a command that need proper authorization ie. only create a listing if you're a verified member.
```ts
let discord_accountId = getUserDiscordID();
const { accessToken } = await authClient.getAccessToken({
  providerId: "discord", // which provider (discord, roblox, google, etc.)
  accountId: discord_accountId,
})
``` 

The bot gets the accessToken of the user and check if the user could perform that action.
#### Scenario:
Users want to verify if a specific Discord account is the owner of a roblox's game.
```ts
discordId="123456"
const info = await authClient.accountInfo({
  accountId: discordId, // here you pass in the provider given account id, the provider is automatically detected from the account id
})
# Then check the account info with the roblox info from roblox api
```
## 5. Unlinking Accounts

Users may unlink accounts, but at least one login method must remain unless explicitly overridden.
```ts
await authClient.unlinkAccount({
  providerId: "discord"
})

await authClient.unlinkAccount({
  providerId: "roblox"
})

```

## 6. Provider Options

All socialProviders support the following optional parameters:
- scope?: string[] – OAuth scopes (["email", "profile"])
- redirectURI?: string – Custom redirect URI (default: /api/auth/ callback/{provider})
- disableSignUp?: boolean – Prevents new accounts (set true for Discord/Roblox)
- disableIdTokenSignIn?: boolean – Disables ID token login
- verifyIdToken?: (token) => boolean – Custom ID token verifier
- overrideUserInfoOnSignIn?: boolean – Always update user info
- mapProfileToUser?: (profile) => User – Custom profile mapping
- refreshAccessToken?: (token) => Promise<{ accessToken: string, refreshToken: string }> – Custom refresh logic

Special for Discord:
- permissions?: number – Bot permission bitmask
# Tasks to do
- Set up web app with Next or Vite, only the login/signup/linking screens are needed for now
- Set up all 2 screens
- Verify command on discord
- Implement authorization for all discord commands with getAccessToken()
