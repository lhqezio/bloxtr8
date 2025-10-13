import {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} from 'discord.js';

/**
 * Bloxtr8 Discord UI Design System
 *
 * Design Principles:
 * 1. Color Psychology - Each color has semantic meaning
 * 2. Visual Hierarchy - Clear information structure
 * 3. Progressive Disclosure - Show only what's needed
 * 4. Consistent Branding - Unified look and feel
 * 5. User-Centric - Focus on user actions and outcomes
 */

// Color System - Semantic meaning (Bloxtr8 inspired)
export const Colors = {
  // Success states - completion, positive actions
  SUCCESS: 0x00d4aa, // Teal - matches Bloxtr8's success color

  // Warning states - setup required, attention needed
  WARNING: 0xf59e0b, // Amber - matches Bloxtr8's warning color

  // Error states - failures, critical issues
  ERROR: 0xef4444, // Red - matches Bloxtr8's error color

  // Information states - verification, neutral
  INFO: 0x6366f1, // Indigo - matches Bloxtr8's info color

  // Confirmation states - linked accounts, ready
  CONFIRM: 0x10b981, // Green - matches Bloxtr8's confirm color

  // Neutral states - general information
  NEUTRAL: 0x6b7280, // Gray

  // Security/Trust states - escrow protection
  SECURITY: 0x8b5cf6, // Purple - for security indicators

  // Trading states - high-value transactions
  TRADING: 0x059669, // Emerald - for trading-related actions
} as const;

// Icon System - Meaningful and consistent (Bloxtr8 inspired)
export const Icons = {
  // Status indicators
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  LOADING: '⏳',

  // Security & Trust indicators
  SECURITY: '🔒',
  VERIFIED: '✓',
  PROTECTED: '🛡️',
  ESCROW: '🏦',

  // Actions
  LINK: '🔗',
  VERIFY: '🔍',
  CREATE: '➕',
  EDIT: '✏️',
  DELETE: '🗑️',
  CANCEL: '❌',

  // Account types
  DISCORD: '🎮',
  ROBLOX: '🎯',
  ACCOUNT: '👤',

  // Trading
  LISTING: '📋',
  TRADE: '🤝',
  MONEY: '💰',
  HIGH_VALUE: '💎',

  // Navigation
  NEXT: '➡️',
  BACK: '⬅️',
  UP: '⬆️',
  DOWN: '⬇️',
} as const;

// Standard button styles
export const ButtonStyles = {
  PRIMARY: ButtonStyle.Primary,
  SUCCESS: ButtonStyle.Success,
  DANGER: ButtonStyle.Danger,
  SECONDARY: ButtonStyle.Secondary,
  LINK: ButtonStyle.Link,
} as const;

/**
 * Creates a standardized embed with consistent styling
 */
export class Bloxtr8Embed extends EmbedBuilder {
  constructor() {
    super();
    this.setFooter({
      text: 'Bloxtr8 • Secure Roblox Trading',
      iconURL:
        'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
    });
    this.setTimestamp();
  }

  // Success embed - completion, positive outcomes
  static success(title: string, description?: string): Bloxtr8Embed {
    const embed = new Bloxtr8Embed()
      .setColor(Colors.SUCCESS)
      .setTitle(`${Icons.SUCCESS} ${title}`);

    if (description) {
      embed.setDescription(`**${description}**`);
    }

    return embed;
  }

  // Error embed - failures, critical issues
  static error(title: string, description?: string): Bloxtr8Embed {
    const embed = new Bloxtr8Embed()
      .setColor(Colors.ERROR)
      .setTitle(`${Icons.ERROR} ${title}`);

    if (description) {
      embed.setDescription(`**${description}**`);
    }

    return embed;
  }

  // Warning embed - setup required, attention needed
  static warning(title: string, description?: string): Bloxtr8Embed {
    const embed = new Bloxtr8Embed()
      .setColor(Colors.WARNING)
      .setTitle(`${Icons.WARNING} ${title}`);

    if (description) {
      embed.setDescription(`**${description}**`);
    }

    return embed;
  }

  // Info embed - verification, neutral information
  static info(title: string, description?: string): Bloxtr8Embed {
    const embed = new Bloxtr8Embed()
      .setColor(Colors.INFO)
      .setTitle(`${Icons.INFO} ${title}`);

    if (description) {
      embed.setDescription(`**${description}**`);
    }

    return embed;
  }

  // Confirm embed - linked accounts, ready states
  static confirm(title: string, description?: string): Bloxtr8Embed {
    const embed = new Bloxtr8Embed()
      .setColor(Colors.CONFIRM)
      .setTitle(`${Icons.SUCCESS} ${title}`);

    if (description) {
      embed.setDescription(`**${description}**`);
    }

    return embed;
  }

  // Add user avatar as thumbnail
  addUserAvatar(userId: string, avatarHash?: string): Bloxtr8Embed {
    if (avatarHash) {
      this.setThumbnail(
        `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=256`
      );
    } else {
      this.setThumbnail(
        `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`
      );
    }
    return this;
  }

  // Add action fields with consistent formatting
  addActionField(name: string, value: string, inline = true): Bloxtr8Embed {
    return this.addFields({
      name: `**${name}**`,
      value,
      inline,
    });
  }

  // Add status field with icon
  addStatusField(
    status: 'success' | 'warning' | 'error' | 'info',
    text: string
  ): Bloxtr8Embed {
    const icon =
      status === 'success'
        ? Icons.SUCCESS
        : status === 'warning'
          ? Icons.WARNING
          : status === 'error'
            ? Icons.ERROR
            : Icons.INFO;

    return this.addFields({
      name: `${icon} Status`,
      value: text,
      inline: false,
    });
  }
}

/**
 * Standardized button components
 */
export class Bloxtr8Button {
  // Primary action button
  static primary(label: string, customId: string): ButtonBuilder {
    return new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyles.PRIMARY)
      .setCustomId(customId);
  }

  // Success/confirm button
  static success(label: string, customId: string): ButtonBuilder {
    return new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyles.SUCCESS)
      .setCustomId(customId);
  }

  // Danger/cancel button
  static danger(label: string, customId: string): ButtonBuilder {
    return new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyles.DANGER)
      .setCustomId(customId);
  }

  // Secondary button
  static secondary(label: string, customId: string): ButtonBuilder {
    return new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyles.SECONDARY)
      .setCustomId(customId);
  }

  // Link button
  static link(label: string, url: string): ButtonBuilder {
    return new ButtonBuilder()
      .setLabel(label)
      .setStyle(ButtonStyles.LINK)
      .setURL(url);
  }
}

/**
 * Common embed patterns for different scenarios (Bloxtr8 inspired)
 */
export const EmbedPatterns = {
  // Account setup required
  accountSetupRequired: () =>
    Bloxtr8Embed.warning(
      'Account Setup Required',
      'Complete your account setup to access trading features'
    )
      .addActionField(
        'Next Step',
        'Use `/signup` to create your account',
        false
      )
      .addActionField(
        'Already Signed Up?',
        'Use `/link` to connect Roblox',
        false
      )
      .addStatusField(
        'info',
        '🔒 All trades protected by escrow • ⚡ Real-time verification'
      ),

  // Account already exists
  accountExists: (username: string) =>
    Bloxtr8Embed.info(
      'Welcome Back!',
      `You already have a Bloxtr8 account, ${username}`
    )
      .addActionField(
        'Check Status',
        'Use `/verify` to see your accounts',
        true
      )
      .addActionField(
        'Create Listing',
        'Use `/listing create` to start trading',
        true
      )
      .addStatusField('success', '🛡️ Your community is protected'),

  // Roblox linking required
  robloxRequired: () =>
    Bloxtr8Embed.warning(
      'Roblox Account Required',
      'Link your Roblox account to verify asset ownership'
    )
      .addActionField(
        'Quick Fix',
        'Use `/link` to connect your Roblox account',
        false
      )
      .addStatusField(
        'warning',
        '⚠️ Verification required for high-value trades'
      ),

  // Successfully linked
  successfullyLinked: (accountType: 'roblox' | 'discord') =>
    Bloxtr8Embed.success(
      `${accountType === 'roblox' ? 'Roblox' : 'Discord'} Connected!`,
      'Your account is now linked and ready to use'
    )
      .addActionField('Check Status', 'Use `/verify` to see all accounts', true)
      .addActionField(
        'Start Trading',
        'Use `/listing create` to create listings',
        true
      )
      .addStatusField('success', '✅ Ready for secure trading'),

  // Verification expired
  verificationExpired: () =>
    Bloxtr8Embed.warning(
      'Verification Expired',
      'Your game verification has expired. Please verify again.'
    )
      .addActionField(
        'Why?',
        'Security measure to ensure accurate listings',
        true
      )
      .addActionField('Time Limit', '15 minutes after verification', true)
      .addActionField('Next Step', 'Use `/listing` to start over', true)
      .addStatusField(
        'warning',
        '🔒 Security timeout for community protection'
      ),

  // High-value trade protection
  highValueTradeProtection: (amount: string) =>
    Bloxtr8Embed.confirm(
      'High-Value Trade Protection',
      `Trade amount: ${amount} - Enhanced security activated`
    )
      .addActionField(
        'Escrow Status',
        '💰 Funds secured in escrow wallet',
        true
      )
      .addActionField(
        'Verification',
        '🔍 Real-time security checks running',
        true
      )
      .addStatusField(
        'success',
        '🛡️ Community protected • ⚡ Auto-refresh every 30s'
      ),

  // Trust score display
  trustScoreDisplay: (score: number) =>
    Bloxtr8Embed.info('Trust Assessment', `Your trust score: ${score}/100`)
      .addActionField('Wallet Check', '✅ No blacklisted addresses', true)
      .addActionField('Account Age', '✅ Verified account history', true)
      .addActionField('Identity Check', '✅ Phone + Email verified', true)
      .addStatusField(
        'success',
        `🔒 Trust score: ${score}/100 • Trade approved`
      ),
};

/**
 * Common button patterns (Bloxtr8 inspired)
 */
export const ButtonPatterns = {
  // Primary action buttons
  primaryActions: (hasNext = true, hasCancel = true) => {
    const buttons = [];
    if (hasNext) buttons.push(Bloxtr8Button.primary('Continue', 'continue'));
    if (hasCancel) buttons.push(Bloxtr8Button.secondary('Cancel', 'cancel'));
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons);
  },

  // Account management buttons
  accountActions: () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Bloxtr8Button.link('🔍 Verify Account', '/verify'),
      Bloxtr8Button.link('🔗 Link Roblox', '/link'),
      Bloxtr8Button.link('📋 Create Listing', '/listing create')
    ),

  // Trading action buttons
  tradingActions: () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Bloxtr8Button.primary('📋 Create Listing', 'create_listing'),
      Bloxtr8Button.secondary('🔍 Verify Game', 'verify_game'),
      Bloxtr8Button.secondary('❌ Cancel', 'cancel')
    ),

  // Security-focused buttons
  securityActions: () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Bloxtr8Button.success(
        '🛡️ Start Protected Trade',
        'start_protected_trade'
      ),
      Bloxtr8Button.link('🔒 View Security Status', '/security'),
      Bloxtr8Button.secondary('ℹ️ Learn More', 'learn_security')
    ),

  // High-value trade buttons
  highValueTradeActions: () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Bloxtr8Button.success(
        '💎 Start High-Value Trade',
        'start_high_value_trade'
      ),
      Bloxtr8Button.link('🔍 Verify Trust Score', '/trust_score'),
      Bloxtr8Button.secondary('❌ Cancel Trade', 'cancel_trade')
    ),

  // Community protection buttons
  communityProtectionActions: () =>
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      Bloxtr8Button.primary('🛡️ Protect Community', 'protect_community'),
      Bloxtr8Button.link('📊 View Stats', '/community_stats'),
      Bloxtr8Button.secondary('ℹ️ How It Works', 'how_protection_works')
    ),
};
