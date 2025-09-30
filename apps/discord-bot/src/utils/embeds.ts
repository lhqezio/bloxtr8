import { EmbedBuilder } from 'discord.js';

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

  // Single clean embed with all information
  const mainEmbed = new EmbedBuilder()
    .setTitle('🔍 Account Verification')
    .setColor(0x5865f2)
    .setThumbnail(
      discordUserInfo?.avatar
        ? `https://cdn.discordapp.com/avatars/${discordUserInfo.id}/${discordUserInfo.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUserInfo?.discriminator || '0') % 5}.png`
    )
    .addFields({
      name: '📋 Profile Information',
      value: `**Name:** ${user.name || 'Not set'}\n**KYC Status:** ${user.kycVerified ? '✅ Verified' : '❌ Not Verified'}\n**Tier:** ${user.kycTier}`,
      inline: false,
    });

  // Discord section
  if (discordAccount && discordUserInfo) {
    mainEmbed.addFields({
      name: '🎮 Discord Account',
      value: `**Username:** ${discordUserInfo.username}\n**Display Name:** ${discordUserInfo.display_name || discordUserInfo.username}\n**ID:** ${discordUserInfo.id}\n[**View Profile**](https://discord.com/users/${discordUserInfo.id})`,
      inline: true,
    });
  } else {
    mainEmbed.addFields({
      name: '🎮 Discord Account',
      value: '❌ **Not Linked**\nUse `/signup` to create your account',
      inline: true,
    });
  }

  // Roblox section
  if (robloxAccount && robloxUserInfo) {
    mainEmbed.addFields({
      name: '🎯 Roblox Account',
      value: `**Username:** ${robloxUserInfo.name}\n**Display Name:** ${robloxUserInfo.displayName}\n**Created:** <t:${Math.floor(new Date(robloxUserInfo.created).getTime() / 1000)}:R>\n[**View Profile**](https://www.roblox.com/users/${robloxAccount.accountId}/profile)`,
      inline: true,
    });
  } else {
    mainEmbed.addFields({
      name: '🎯 Roblox Account',
      value: '❌ **Not Linked**\nUse `/link` to connect your account',
      inline: true,
    });
  }

  // Add a nice footer
  const linkedCount = [discordAccount, robloxAccount].filter(Boolean).length;
  mainEmbed
    .setFooter({
      text: `${linkedCount}/2 accounts linked • Bloxtr8 Verification System`,
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    })
    .setTimestamp();

  embeds.push(mainEmbed);

  return { embeds };
}
