import { EmbedBuilder } from 'discord.js';

import type { Account } from './userVerification.js';

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

export function buildVerificationEmbeds(accounts: Account[]) {
  const embeds: EmbedBuilder[] = [];

  for (const provider of providers) {
    const account = accounts.find(a => a.providerId === provider.id);

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
