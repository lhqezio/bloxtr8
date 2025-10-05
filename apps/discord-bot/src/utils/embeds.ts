import { EmbedBuilder } from 'discord.js';

import { Bloxtr8Embed, Colors, Icons } from './designSystem.js';
import type { Account, VerifyResponse } from './userVerification.js';

interface ProviderConfig {
  id: 'roblox' | 'discord';
  label: string;
  // eslint-disable-next-line no-unused-vars
  buildUrl: (accountId: string) => string;
}

// define all providers here
const providers: ProviderConfig[] = [
  {
    id: 'roblox',
    label: 'Roblox',
    buildUrl: id => `https://www.roblox.com/users/${id}/profile`,
  },
  {
    id: 'discord',
    label: 'Discord',
    buildUrl: id => `https://discord.com/users/${id}`,
  },
];

export function buildVerificationEmbeds(data: Account[] | VerifyResponse) {
  const embeds: EmbedBuilder[] = [];

  // Handle legacy format (Account[])
  if (Array.isArray(data)) {
    for (const provider of providers) {
      const account = data.find(a => a.providerId === provider.id);

      const embed = new EmbedBuilder()
        .setTitle(`${provider.label} Account`)
        .setColor(account ? 0x10b981 : 0xef4444)
        .setThumbnail(
          provider.id === 'roblox'
            ? 'https://cdn.discordapp.com/attachments/1234567890/1234567890/roblox-icon.png'
            : 'https://cdn.discordapp.com/attachments/1234567890/1234567890/discord-icon.png'
        )
        .addFields({
          name: account ? '✅ Connected' : '❌ Not Linked',
          value: account
            ? `[View Profile](${provider.buildUrl(account.accountId)})`
            : provider.id === 'discord'
              ? `Use \`/signup\` to connect`
              : `Use \`/link\` to connect`,
        })
        .setFooter({
          text: account ? 'Verified' : 'Link to unlock',
          iconURL:
            'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
        })
        .setTimestamp();

      embeds.push(embed);
    }
    return { embeds };
  }

  // Handle new detailed format (VerifyResponse)
  const response = data as VerifyResponse;
  const { user, accounts, discordUserInfo, robloxUserInfo } = response;

  const discordAccount = accounts.find(a => a.providerId === 'discord');
  const robloxAccount = accounts.find(a => a.providerId === 'roblox');

  // Determine verification status and color (Bloxtr8 inspired)
  let verificationStatus: string;
  let embedColor: number;

  if (user.kycTier === 'TIER_0') {
    verificationStatus = '🔴 Setup Required';
    embedColor = Colors.WARNING;
  } else if (user.kycTier === 'TIER_1') {
    verificationStatus = '🟡 Partially Verified';
    embedColor = Colors.WARNING;
  } else if (user.kycVerified) {
    verificationStatus = '✅ Fully Verified';
    embedColor = Colors.SUCCESS;
  } else {
    verificationStatus = '❌ Not Verified';
    embedColor = Colors.ERROR;
  }

  // Create main embed with new design system
  const mainEmbed = Bloxtr8Embed.info(
    'Account Verification',
    `Your Bloxtr8 account status`
  )
    .setColor(embedColor)
    .addUserAvatar(
      discordUserInfo?.id || '',
      discordUserInfo?.avatar || undefined
    )
    .addActionField(
      'Profile',
      `**Name:** ${user.name || 'Not set'}\n**Status:** ${verificationStatus}\n**Tier:** ${user.kycTier}`,
      false
    );

  // Discord account section
  if (discordAccount && discordUserInfo) {
    mainEmbed.addActionField(
      `${Icons.DISCORD} Discord Account`,
      `**Username:** ${discordUserInfo.username}\n**Display:** ${discordUserInfo.display_name || discordUserInfo.username}\n**ID:** ${discordUserInfo.id}\n[View Profile](https://discord.com/users/${discordUserInfo.id})`,
      true
    );
  } else {
    mainEmbed.addActionField(
      `${Icons.DISCORD} Discord Account`,
      '❌ **Not Linked**\nUse `/signup` to create your account',
      true
    );
  }

  // Roblox account section
  if (robloxAccount && robloxUserInfo) {
    mainEmbed.addActionField(
      `${Icons.ROBLOX} Roblox Account`,
      `**Username:** ${robloxUserInfo.name}\n**Display:** ${robloxUserInfo.displayName}\n**Created:** <t:${Math.floor(new Date(robloxUserInfo.created).getTime() / 1000)}:R>\n[View Profile](https://www.roblox.com/users/${robloxAccount.accountId}/profile)`,
      true
    );
  } else {
    mainEmbed.addActionField(
      `${Icons.ROBLOX} Roblox Account`,
      '❌ **Not Linked**\nUse `/link` to connect your Roblox account',
      true
    );
  }

  // Add contextual footer based on account status (Bloxtr8 inspired)
  const linkedCount = [discordAccount, robloxAccount].filter(Boolean).length;
  let statusMessage = '';
  let trustIndicator = '';

  if (!robloxAccount && discordAccount) {
    statusMessage = 'Link Roblox to unlock trading features';
    trustIndicator = '🔒 All trades protected by escrow';
  } else if (!discordAccount) {
    statusMessage = 'Use /signup to get started';
    trustIndicator = '🛡️ Community protection available';
  } else if (linkedCount === 2) {
    statusMessage = 'Ready to trade!';
    trustIndicator = '✅ Verified trader • 🛡️ Community protected';
  }

  mainEmbed.setFooter({
    text: `${linkedCount}/2 accounts linked${statusMessage ? ` • ${statusMessage}` : ''}${trustIndicator ? ` • ${trustIndicator}` : ''} • Bloxtr8`,
    iconURL:
      'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
  });

  embeds.push(mainEmbed);

  return { embeds };
}
