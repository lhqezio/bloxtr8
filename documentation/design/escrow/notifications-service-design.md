# Notifications Service Design Document

## Overview

This document defines the complete design for the Notifications Service, which serves as the notification delivery engine for Bloxtr8. The Notifications Service handles user notifications via Discord DMs, manages notification preferences, implements retry logic for failed deliveries, and provides notification templates for all escrow and payment events.

**Key Design Principles**:

- Reuse existing Discord utilities from `apps/discord-bot/src/utils/dmHelper.ts`
- Follow existing embed builder patterns from `apps/discord-bot/src/utils/offerEmbeds.ts`
- Event-driven architecture (Kafka) rather than polling
- Maintain consistency with existing notification styling and branding

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Discord DM Integration](#discord-dm-integration)
3. [Event Subscription Patterns](#event-subscription-patterns)
4. [Notification Templates](#notification-templates)
5. [Retry and Failure Handling](#retry-and-failure-handling)
6. [Notification Preferences](#notification-preferences)
7. [Database Schema](#database-schema)
8. [Kafka Consumer Implementation](#kafka-consumer-implementation)
9. [Implementation Details](#implementation-details)
10. [Monitoring and Observability](#monitoring-and-observability)
11. [Existing vs New Implementation](#existing-vs-new-implementation)
12. [Service Separation Decision](#service-separation-decision)

## Architecture Overview

### Service Role

The Notifications Service is responsible for:

- **Event Consumption**: Subscribes to escrow and payment events from Kafka
- **Discord Integration**: Sends DMs to users via Discord.js (reusing existing utilities)
- **Template Management**: Uses TypeScript embed builder functions (not Handlebars)
- **Preference Enforcement**: Respects user notification preferences
- **Retry Logic**: Handles failed notifications with exponential backoff
- **Failure Tracking**: Maintains audit trail of notification delivery attempts

### Technology Stack

- **Runtime**: Node.js 20+ with TypeScript
- **Database**: PostgreSQL 14+ via Prisma ORM
- **Event Bus**: Apache Kafka (consumes from `escrow.events.v1` and `payments.events.v1`)
- **Discord SDK**: discord.js v14+
- **Retry Library**: Custom exponential backoff implementation
- **Template Format**: TypeScript functions (EmbedBuilder-based, matching existing patterns)

### Communication Patterns

```
Escrow Service → Kafka (Events) → Notifications Service → Discord API
Payments Service → Kafka (Events) → Notifications Service → Discord API
                                    ↓
                              PostgreSQL (NotificationDelivery)
```

### Service Boundaries

The Notifications Service operates independently:

- **Escrow Service**: Manages escrow state and emits domain events
- **Payments Service**: Handles payments and emits payment events
- **Notifications Service**: Consumes events and delivers notifications
- **Communication**: Via Kafka events only (no direct API calls)

### Integration Points

1. **Escrow Service**: Consumes `EscrowCreated`, `EscrowFundsHeld`, `EscrowDelivered`, `EscrowReleased`, `EscrowRefunded`, `EscrowDisputed` events
2. **Payments Service**: Consumes `PaymentIntentCreated`, `PaymentSucceeded`, `PaymentFailed`, `TransferSucceeded`, `RefundSucceeded` events
3. **Discord API**: REST API for sending DMs (rate limits: 50 requests/second per bot)
4. **Database**: Stores notification delivery records, notification preferences, and retry attempts

## Discord DM Integration

### Discord Client Setup

**Configuration**:

- **Bot Token**: From environment variable
- **Intents**: DirectMessages intent required
- **Rate Limiting**: Respect Discord API rate limits
- **Error Handling**: Handle Discord API errors gracefully

**Environment Variables**:

```typescript
DISCORD_BOT_TOKEN=...
DISCORD_CLIENT_ID=...
DISCORD_GUILD_ID=... // Optional, for fallback channels
```

### Discord Client Implementation

**Base Discord Client**:

```typescript
import { Client, GatewayIntentBits } from 'discord.js';

export class DiscordClient {
  private static instance: DiscordClient;
  private client: Client;
  private isConnected: boolean = false;

  private constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.Guilds, // May be needed for user fetching
      ],
    });

    this.setupEventHandlers();
  }

  static getInstance(): DiscordClient {
    if (!DiscordClient.instance) {
      DiscordClient.instance = new DiscordClient();
    }
    return DiscordClient.instance;
  }

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    await this.client.login(process.env.DISCORD_BOT_TOKEN);
    this.isConnected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await this.client.destroy();
    this.isConnected = false;
  }

  getClient(): Client {
    return this.client;
  }

  private setupEventHandlers(): void {
    this.client.once('ready', () => {
      console.log(`Discord client ready: ${this.client.user?.tag}`);
    });

    this.client.on('error', error => {
      console.error('Discord client error:', error);
    });

    this.client.on('rateLimit', rateLimitInfo => {
      console.warn('Discord rate limit:', rateLimitInfo);
    });
  }
}
```

**Connection Management**:

- Singleton pattern ensures single Discord client instance
- Automatic reconnection on disconnect
- Error handling and logging
- Rate limit tracking

### DM Sending Strategy

**Reuse Existing Utilities**:

Adapt `sendDM` and `sendDMWithEmbed` from `apps/discord-bot/src/utils/dmHelper.ts`:

```typescript
import {
  type User,
  type MessageCreateOptions,
  EmbedBuilder,
  type ActionRowBuilder,
  type ButtonBuilder,
  DiscordAPIError,
} from 'discord.js';

export interface DMSendResult {
  success: boolean;
  error?: string;
  fallbackUsed?: boolean;
}

/**
 * Sends a DM to a user with fallback handling for common errors
 */
export async function sendDM(
  user: User,
  content: MessageCreateOptions
): Promise<DMSendResult> {
  try {
    await user.send(content);
    return { success: true };
  } catch (error) {
    console.error(`Failed to send DM to user ${user.id}:`, error);

    // Handle specific Discord API errors
    if (error instanceof DiscordAPIError) {
      switch (error.code) {
        case 50007: // Cannot send messages to this user
          return {
            success: false,
            error: 'User has DMs disabled or blocked the bot',
            fallbackUsed: false,
          };
        case 50001: // Missing access
          return {
            success: false,
            error: 'Bot does not have access to send DMs to this user',
            fallbackUsed: false,
          };
        case 50013: // Missing permissions
          return {
            success: false,
            error: 'Bot lacks permissions to send DMs',
            fallbackUsed: false,
          };
        default:
          return {
            success: false,
            error: `Discord API error: ${error.message}`,
            fallbackUsed: false,
          };
      }
    }

    // Handle other errors
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      fallbackUsed: false,
    };
  }
}

/**
 * Sends a DM with an embed and optional buttons
 */
export async function sendDMWithEmbed(
  user: User,
  embed: EmbedBuilder,
  components?: ActionRowBuilder<ButtonBuilder>[]
): Promise<DMSendResult> {
  const content: MessageCreateOptions = {
    embeds: [embed],
  };

  if (components) {
    content.components = components;
  }

  return sendDM(user, content);
}
```

**Direct DM Approach**:

- Fetch user by Discord ID using `client.users.fetch()`
- Send DM via `user.send()` wrapped in error handler
- Handle common Discord errors:
  - 50007: User has DMs disabled or blocked the bot
  - 50001: Bot does not have access to send DMs
  - 50013: Bot lacks permissions to send DMs

**Fallback Strategies**:

- Log failed DMs for manual follow-up
- Store in notification queue for retry
- Consider guild channel fallback (future enhancement)
- Mark notifications as sent even if DM fails (to prevent infinite retries, matching existing pattern)

### Rate Limiting

**Discord API Limits**:

- 50 requests/second per bot
- 50 requests/second per user (for DMs)
- Implement request queue with rate limit tracking

**Implementation**:

```typescript
export class RateLimiter {
  private queues: Map<string, Array<() => Promise<void>>> = new Map();
  private processing: Map<string, boolean> = new Map();
  private readonly maxRequestsPerSecond = 50;
  private readonly maxRequestsPerUserPerSecond = 50;
  private requestTimestamps: Map<string, number[]> = new Map();

  async execute<T>(
    userId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const queue = this.queues.get(userId) || [];
      queue.push(async () => {
        try {
          await this.waitForRateLimit(userId);
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.queues.set(userId, queue);
      this.processQueue(userId);
    });
  }

  private async waitForRateLimit(userId: string): Promise<void> {
    const now = Date.now();
    const timestamps = this.requestTimestamps.get(userId) || [];
    const recentRequests = timestamps.filter(
      ts => now - ts < 1000 // Last second
    );

    if (recentRequests.length >= this.maxRequestsPerUserPerSecond) {
      const oldestRequest = recentRequests[0];
      const waitTime = 1000 - (now - oldestRequest);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    timestamps.push(Date.now());
    // Keep only last 100 timestamps
    if (timestamps.length > 100) {
      timestamps.shift();
    }
    this.requestTimestamps.set(userId, timestamps);
  }

  private async processQueue(userId: string): Promise<void> {
    if (this.processing.get(userId)) {
      return;
    }

    this.processing.set(userId, true);

    while (true) {
      const queue = this.queues.get(userId);
      if (!queue || queue.length === 0) {
        break;
      }

      const fn = queue.shift()!;
      await fn();
    }

    this.processing.set(userId, false);
  }
}
```

**Queue-Based Rate Limiting**:

- Separate queue per user
- Exponential backoff on rate limit errors
- Request throttling per user
- Tracks request timestamps for rate limit enforcement

## Event Subscription Patterns

### Kafka Consumer Groups

**Consumer Group**: `notifications-service`
**Partitions**: 12 (one consumer per partition for parallel processing)
**Offset Management**: Manual commit after successful notification delivery

### Event Types

**Escrow Events**:

- `EscrowCreated` - Notify buyer and seller
- `EscrowFundsHeld` - Notify seller (funds secured)
- `EscrowDelivered` - Notify buyer (delivery complete)
- `EscrowReleased` - Notify both parties (transaction complete)
- `EscrowRefunded` - Notify buyer (refund processed)
- `EscrowDisputed` - Notify both parties and admins

**Payment Events**:

- `PaymentIntentCreated` - Notify buyer (payment link ready)
- `PaymentSucceeded` - Notify buyer (payment confirmed)
- `PaymentFailed` - Notify buyer (payment failed)
- `TransferSucceeded` - Notify seller (funds transferred)
- `RefundSucceeded` - Notify buyer (refund processed)

### Event Handler Pattern

**Handler Structure**:

- One handler per event type
- Idempotent processing (check NotificationDelivery table)
- Extract user IDs from event payload
- Fetch user data (buyer/seller names, Discord IDs) from database
- Check notification preferences
- Build notification embed using template functions
- Send notification via Discord using `sendDMWithEmbed`
- Record delivery attempt

**Base Event Handler**:

```typescript
export abstract class EventHandler<TEvent> {
  constructor(
    protected prisma: PrismaClient,
    protected discordClient: DiscordClient,
    protected rateLimiter: RateLimiter,
    protected preferenceService: NotificationPreferenceService
  ) {}

  abstract getEventType(): string;
  abstract getRecipients(event: TEvent): Promise<string[]>; // Returns user IDs
  abstract buildEmbed(event: TEvent, userData: UserData): EmbedBuilder;

  async handle(event: TEvent, eventId: string): Promise<void> {
    // 1. Check idempotency
    const recipients = await this.getRecipients(event);
    
    for (const userId of recipients) {
      const existing = await this.prisma.notificationDelivery.findUnique({
        where: {
          eventId_userId: {
            eventId,
            userId,
          },
        },
      });

      if (existing) {
        console.log(`Notification already sent for event ${eventId} to user ${userId}`);
        continue;
      }

      // 2. Check preferences
      const preference = await this.preferenceService.getPreference(
        userId,
        this.getEventType()
      );

      if (!preference.enabled) {
        console.log(`Notification disabled for user ${userId}, event ${this.getEventType()}`);
        await this.recordSkippedNotification(eventId, userId, 'DISABLED');
        continue;
      }

      // 3. Check quiet hours
      if (this.preferenceService.isQuietHours(preference)) {
        console.log(`Quiet hours active for user ${userId}`);
        await this.recordSkippedNotification(eventId, userId, 'QUIET_HOURS');
        continue;
      }

      // 4. Fetch user data
      const userData = await this.fetchUserData(userId);

      // 5. Build embed
      const embed = this.buildEmbed(event, userData);

      // 6. Send notification
      await this.sendNotification(userId, userData.discordUserId, embed, eventId);
    }
  }

  private async sendNotification(
    userId: string,
    discordUserId: string,
    embed: EmbedBuilder,
    eventId: string
  ): Promise<void> {
    // Create delivery record
    const delivery = await this.prisma.notificationDelivery.create({
      data: {
        eventId,
        eventType: this.getEventType(),
        userId,
        discordUserId,
        status: 'PENDING',
      },
    });

    try {
      // Send via Discord
      const user = await this.discordClient.getClient().users.fetch(discordUserId);
      const result = await this.rateLimiter.execute(discordUserId, () =>
        sendDMWithEmbed(user, embed)
      );

      if (result.success) {
        await this.prisma.notificationDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'SENT',
            sentAt: new Date(),
          },
        });
      } else {
        // Handle retry logic
        await this.handleDeliveryFailure(delivery.id, result.error!);
      }
    } catch (error) {
      await this.handleDeliveryFailure(delivery.id, error.message);
    }
  }

  private async handleDeliveryFailure(
    deliveryId: string,
    error: string
  ): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) return;

    const isRetryable = this.isRetryableError(error);
    const shouldRetry = delivery.retryCount < 5 && isRetryable;

    if (shouldRetry) {
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'RETRYING',
          retryCount: { increment: 1 },
          lastAttemptAt: new Date(),
          errorMessage: error,
        },
      });

      // Schedule retry with exponential backoff
      const delay = this.calculateRetryDelay(delivery.retryCount);
      setTimeout(() => {
        this.retryNotification(deliveryId);
      }, delay);
    } else {
      await this.prisma.notificationDelivery.update({
        where: { id: deliveryId },
        data: {
          status: 'FAILED',
          failedAt: new Date(),
          errorMessage: error,
        },
      });
    }
  }

  private isRetryableError(error: string): boolean {
    // Retry on rate limits and server errors
    return (
      error.includes('429') ||
      error.includes('500') ||
      error.includes('502') ||
      error.includes('503') ||
      error.includes('504')
    );
  }

  private calculateRetryDelay(retryCount: number): number {
    const baseDelay = 60000; // 1 minute
    const maxDelay = 3600000; // 1 hour
    const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);
    const jitter = delay * 0.2 * Math.random(); // 0-20% jitter
    return delay + jitter;
  }
}
```

### Idempotency

**NotificationDelivery Table**:

- Stores delivery records with event ID + user ID composite key
- Prevents duplicate notifications
- Tracks delivery status and retry count

## Notification Templates

### Template Structure

**Template Types**:

- Escrow templates (created, funds held, delivered, released, refunded, disputed)
- Payment templates (intent created, succeeded, failed, transfer succeeded, refund succeeded)
- Admin templates (dispute opened, high-value transaction)

**Template Format**:

- TypeScript functions (following existing pattern from `offerEmbeds.ts`)
- EmbedBuilder-based structure (not Handlebars - matches existing codebase)
- Embed structure: title, description, fields, footer, timestamp, thumbnail
- Action buttons where applicable (using ActionRowBuilder + ButtonBuilder)
- Color coding by event type (consistent with existing patterns)

### Embed Builder Pattern

**Follow Existing Patterns**:

- Reuse `formatCurrency` utility for amount formatting (from `offerEmbeds.ts`)
- Use EmbedBuilder from discord.js directly
- Match existing color scheme:
  - Success: `0x10b981` (Green)
  - Error: `0xef4444` (Red)
  - Info: `0x3b82f6` (Blue)
  - Warning: `0xf59e0b` (Amber)
  - Brand: `0x00d4aa` (Bloxtr8 teal)
- Use emoji in titles (💰, ✅, ❌, 🔄, etc.)
- Include footer with Bloxtr8 branding and logo icon URL

**Utility Functions**:

```typescript
/**
 * Format currency amount (in cents) to USD
 */
export function formatCurrency(amountCents: bigint | string): string {
  const cents =
    typeof amountCents === 'bigint' ? amountCents : BigInt(amountCents);
  const dollars = Number(cents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(dollars);
}
```

### Template Variables

**Common Variables** (passed as function parameters):

- `escrowId` - Escrow ID
- `amount` - Amount in cents (BigInt or string)
- `currency` - Currency code ('USD' | 'USDC')
- `buyerName` - Buyer display name
- `sellerName` - Seller display name
- `timestamp` - Event timestamp (Date)
- `transactionHash` - Transaction hash (for USDC, optional)
- `listingTitle` - Listing title (if available)

### Template Examples

**EscrowCreated Template**:

```typescript
interface EscrowCreatedData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  buyerName: string;
  sellerName: string;
  timestamp: Date;
  rail: 'STRIPE' | 'USDC_BASE';
}

export function buildEscrowCreatedEmbed(
  data: EscrowCreatedData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('📋 Escrow Created')
    .setColor(0x3b82f6) // Blue
    .setDescription(
      `**An escrow has been created for your transaction**\n\nBoth parties will be notified at each step.`
    )
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '💳 Payment Method', value: data.rail === 'STRIPE' ? 'Card Payment' : 'USDC (Base)', inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: false },
      { name: '👤 Buyer', value: data.buyerName, inline: true },
      { name: '👤 Seller', value: data.sellerName, inline: true },
      { name: '📋 Next Steps', value: 'Waiting for buyer to complete payment...', inline: false }
    )
    .setTimestamp(data.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
    });
}
```

**EscrowFundsHeld Template**:

```typescript
interface EscrowFundsHeldData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  timestamp: Date;
}

export function buildEscrowFundsHeldEmbed(
  data: EscrowFundsHeldData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('💰 Funds Secured')
    .setColor(0x10b981) // Green
    .setDescription(
      '**Your payment has been confirmed and funds are being held in escrow**'
    )
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true },
      {
        name: '📋 Next Steps',
        value: 'Waiting for seller to deliver the asset...',
        inline: false,
      }
    )
    .setTimestamp(data.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
    });
}
```

**EscrowDelivered Template**:

```typescript
interface EscrowDeliveredData {
  escrowId: string;
  amount: bigint | string;
  timestamp: Date;
  deliveryEvidence?: string;
}

export function buildEscrowDeliveredEmbed(
  data: EscrowDeliveredData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('📦 Delivery Confirmed')
    .setColor(0x3b82f6) // Blue
    .setDescription(
      '**The seller has marked the delivery as complete**\n\nPlease confirm receipt to release funds.'
    )
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true }
    )
    .setTimestamp(data.timestamp);

  if (data.deliveryEvidence) {
    embed.addFields({
      name: '📎 Delivery Evidence',
      value: data.deliveryEvidence,
      inline: false,
    });
  }

  return embed.setFooter({
    text: 'Bloxtr8 - Secure Roblox Trading',
    iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
  });
}
```

**EscrowReleased Template**:

```typescript
interface EscrowReleasedData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  timestamp: Date;
  transactionHash?: string;
}

export function buildEscrowReleasedEmbed(
  data: EscrowReleasedData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('✅ Transaction Complete')
    .setColor(0x10b981) // Green
    .setDescription('**Funds have been released to the seller**')
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true }
    )
    .setTimestamp(data.timestamp);

  if (data.transactionHash) {
    embed.addFields({
      name: '🔗 Transaction Hash',
      value: `\`${data.transactionHash}\``,
      inline: false,
    });
  }

  return embed.setFooter({
    text: 'Bloxtr8 - Secure Roblox Trading',
    iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
  });
}
```

**EscrowRefunded Template**:

```typescript
interface EscrowRefundedData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  reason: string;
  timestamp: Date;
  transactionHash?: string;
}

export function buildEscrowRefundedEmbed(
  data: EscrowRefundedData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💸 Refund Processed')
    .setColor(0xef4444) // Red
    .setDescription('**Your refund has been processed**')
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true },
      { name: '📝 Reason', value: data.reason, inline: false }
    )
    .setTimestamp(data.timestamp);

  if (data.transactionHash) {
    embed.addFields({
      name: '🔗 Transaction Hash',
      value: `\`${data.transactionHash}\``,
      inline: false,
    });
  }

  return embed.setFooter({
    text: 'Bloxtr8 - Secure Roblox Trading',
    iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
  });
}
```

**EscrowDisputed Template**:

```typescript
interface EscrowDisputedData {
  escrowId: string;
  amount: bigint | string;
  disputedBy: string; // User ID
  reason: string;
  timestamp: Date;
}

export function buildEscrowDisputedEmbed(
  data: EscrowDisputedData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('⚠️ Dispute Opened')
    .setColor(0xf59e0b) // Amber
    .setDescription(
      '**A dispute has been opened for this escrow**\n\nOur team will review and resolve the dispute.'
    )
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true },
      { name: '📝 Reason', value: data.reason, inline: false }
    )
    .setTimestamp(data.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
    });
}
```

**PaymentIntentCreated Template**:

```typescript
interface PaymentIntentCreatedData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  paymentLink?: string; // For Stripe
  depositAddress?: string; // For USDC
  timestamp: Date;
}

export function buildPaymentIntentCreatedEmbed(
  data: PaymentIntentCreatedData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💳 Payment Required')
    .setColor(0x3b82f6) // Blue
    .setDescription(
      '**Complete your payment to proceed with the escrow**'
    )
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true }
    )
    .setTimestamp(data.timestamp);

  if (data.paymentLink) {
    embed.addFields({
      name: '🔗 Payment Link',
      value: `[Click here to pay](${data.paymentLink})`,
      inline: false,
    });
  }

  if (data.depositAddress) {
    embed.addFields({
      name: '📍 Deposit Address',
      value: `\`${data.depositAddress}\``,
      inline: false,
    });
  }

  return embed.setFooter({
    text: 'Bloxtr8 - Secure Roblox Trading',
    iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
  });
}
```

**PaymentSucceeded Template**:

```typescript
interface PaymentSucceededData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  timestamp: Date;
}

export function buildPaymentSucceededEmbed(
  data: PaymentSucceededData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('✅ Payment Confirmed')
    .setColor(0x10b981) // Green
    .setDescription('**Your payment has been successfully processed**')
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true },
      {
        name: '📋 Next Steps',
        value: 'Funds are now held in escrow. Waiting for seller to deliver...',
        inline: false,
      }
    )
    .setTimestamp(data.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
    });
}
```

**PaymentFailed Template**:

```typescript
interface PaymentFailedData {
  escrowId: string;
  amount: bigint | string;
  error: string;
  timestamp: Date;
}

export function buildPaymentFailedEmbed(
  data: PaymentFailedData
): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('❌ Payment Failed')
    .setColor(0xef4444) // Red
    .setDescription('**Your payment could not be processed**')
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true },
      { name: '❌ Error', value: data.error, inline: false },
      {
        name: '📋 Next Steps',
        value: 'Please try again or contact support if the issue persists.',
        inline: false,
      }
    )
    .setTimestamp(data.timestamp)
    .setFooter({
      text: 'Bloxtr8 - Secure Roblox Trading',
      iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
    });
}
```

**TransferSucceeded Template**:

```typescript
interface TransferSucceededData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  timestamp: Date;
  transactionHash?: string;
}

export function buildTransferSucceededEmbed(
  data: TransferSucceededData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💸 Funds Transferred')
    .setColor(0x10b981) // Green
    .setDescription('**Funds have been successfully transferred to your account**')
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true }
    )
    .setTimestamp(data.timestamp);

  if (data.transactionHash) {
    embed.addFields({
      name: '🔗 Transaction Hash',
      value: `\`${data.transactionHash}\``,
      inline: false,
    });
  }

  return embed.setFooter({
    text: 'Bloxtr8 - Secure Roblox Trading',
    iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
  });
}
```

**RefundSucceeded Template**:

```typescript
interface RefundSucceededData {
  escrowId: string;
  amount: bigint | string;
  currency: 'USD' | 'USDC';
  timestamp: Date;
  transactionHash?: string;
}

export function buildRefundSucceededEmbed(
  data: RefundSucceededData
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('💸 Refund Processed')
    .setColor(0x10b981) // Green
    .setDescription('**Your refund has been successfully processed**')
    .addFields(
      { name: '💰 Amount', value: formatCurrency(data.amount), inline: true },
      { name: '📋 Escrow ID', value: data.escrowId, inline: true }
    )
    .setTimestamp(data.timestamp);

  if (data.transactionHash) {
    embed.addFields({
      name: '🔗 Transaction Hash',
      value: `\`${data.transactionHash}\``,
      inline: false,
    });
  }

  return embed.setFooter({
    text: 'Bloxtr8 - Secure Roblox Trading',
    iconURL: 'https://cdn.discordapp.com/attachments/.../bloxtr8-logo.png',
  });
}
```

## Retry and Failure Handling

### Retry Strategy

**Exponential Backoff**:

- Initial delay: 1 minute
- Max delay: 1 hour
- Max retries: 5 attempts
- Jitter: Random 0-20% added to delay

**Retry Triggers**:

- Discord API rate limit (429)
- Discord API server error (500-599)
- Network timeout
- Transient Discord API errors

**Retry Implementation**:

```typescript
export class RetryManager {
  private readonly maxRetries = 5;
  private readonly initialDelay = 60000; // 1 minute
  private readonly maxDelay = 3600000; // 1 hour

  async retryNotification(
    deliveryId: string,
    handler: EventHandler<unknown>
  ): Promise<void> {
    const delivery = await this.prisma.notificationDelivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery || delivery.status !== 'RETRYING') {
      return;
    }

    if (delivery.retryCount >= this.maxRetries) {
      await this.markAsFailed(deliveryId, 'Max retries exceeded');
      return;
    }

    // Calculate delay with exponential backoff and jitter
    const delay = this.calculateDelay(delivery.retryCount);
    
    // Schedule retry
    setTimeout(async () => {
      try {
        await handler.retryNotification(deliveryId);
      } catch (error) {
        console.error(`Retry failed for delivery ${deliveryId}:`, error);
      }
    }, delay);
  }

  private calculateDelay(retryCount: number): number {
    const exponentialDelay = Math.min(
      this.initialDelay * Math.pow(2, retryCount),
      this.maxDelay
    );
    const jitter = exponentialDelay * 0.2 * Math.random(); // 0-20% jitter
    return exponentialDelay + jitter;
  }

  private async markAsFailed(deliveryId: string, reason: string): Promise<void> {
    await this.prisma.notificationDelivery.update({
      where: { id: deliveryId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorMessage: reason,
      },
    });
  }
}
```

### Non-Retryable Errors

**Permanent Failures**:

- User has DMs disabled (50007)
- Bot blocked by user (50001)
- Invalid Discord user ID
- Missing permissions (50013)

**Error Classification**:

```typescript
export class ErrorClassifier {
  static isRetryable(error: string | DiscordAPIError): boolean {
    if (typeof error === 'string') {
      // Check for retryable error codes/messages
      return (
        error.includes('429') || // Rate limit
        error.includes('500') ||
        error.includes('502') ||
        error.includes('503') ||
        error.includes('504') ||
        error.includes('ECONNRESET') ||
        error.includes('ETIMEDOUT')
      );
    }

    if (error instanceof DiscordAPIError) {
      // Permanent failures
      if ([50007, 50001, 50013].includes(error.code)) {
        return false;
      }

      // Retryable errors
      if (error.status === 429 || (error.status >= 500 && error.status < 600)) {
        return true;
      }
    }

    return false;
  }
}
```

### Dead Letter Queue

**Failed Notification Handling**:

- After max retries, mark as permanently failed
- Store in NotificationDelivery with status `FAILED`
- Log for manual review
- Consider alternative notification channels (future)

**Dead Letter Queue Implementation**:

```typescript
export class DeadLetterQueue {
  async processFailedNotifications(): Promise<void> {
    const failedNotifications = await this.prisma.notificationDelivery.findMany({
      where: {
        status: 'FAILED',
        failedAt: {
          lte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        },
      },
      take: 100,
    });

    for (const notification of failedNotifications) {
      await this.logFailedNotification(notification);
      // Future: Could send to alternative channel (email, SMS, etc.)
    }
  }

  private async logFailedNotification(
    notification: NotificationDelivery
  ): Promise<void> {
    console.error('Failed notification:', {
      id: notification.id,
      eventId: notification.eventId,
      eventType: notification.eventType,
      userId: notification.userId,
      discordUserId: notification.discordUserId,
      error: notification.errorMessage,
      retryCount: notification.retryCount,
      failedAt: notification.failedAt,
    });

    // Could also send to monitoring service (Sentry, DataDog, etc.)
  }
}
```

### Notification Delivery Tracking

**NotificationDelivery Model**:

- Event ID + User ID (composite key)
- Delivery status (PENDING, SENT, FAILED, RETRYING)
- Retry count
- Last attempt timestamp
- Error message (if failed)
- Discord message ID (if successful)

## Notification Preferences

### Preference Model

**NotificationPreference Model**:

- User ID
- Event type (granular control)
- Channel (DISCORD_DM, EMAIL, PUSH - future)
- Enabled (boolean)
- Quiet hours (optional time range)

### Default Preferences

**Default Settings**:

- All notifications enabled by default
- Discord DM as primary channel
- No quiet hours

**Default Preference Service**:

```typescript
export class NotificationPreferenceService {
  async getPreference(
    userId: string,
    eventType: string
  ): Promise<NotificationPreference> {
    const preference = await this.prisma.notificationPreference.findUnique({
      where: {
        userId_eventType_channel: {
          userId,
          eventType,
          channel: 'DISCORD_DM',
        },
      },
    });

    if (preference) {
      return preference;
    }

    // Return default preference
    return {
      userId,
      eventType,
      channel: 'DISCORD_DM',
      enabled: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    };
  }

  async updatePreference(
    userId: string,
    eventType: string,
    updates: Partial<NotificationPreference>
  ): Promise<NotificationPreference> {
    return await this.prisma.notificationPreference.upsert({
      where: {
        userId_eventType_channel: {
          userId,
          eventType,
          channel: 'DISCORD_DM',
        },
      },
      create: {
        userId,
        eventType,
        channel: 'DISCORD_DM',
        enabled: updates.enabled ?? true,
        quietHoursStart: updates.quietHoursStart ?? null,
        quietHoursEnd: updates.quietHoursEnd ?? null,
      },
      update: {
        enabled: updates.enabled,
        quietHoursStart: updates.quietHoursStart,
        quietHoursEnd: updates.quietHoursEnd,
      },
    });
  }
}
```

### Preference Categories

**Event Categories**:

- Escrow events (created, funds held, delivered, released, refunded, disputed)
- Payment events (intent created, succeeded, failed, transfer succeeded, refund succeeded)
- Admin events (dispute opened, high-value transaction)

**Granular Control**:

- Per-event-type preferences
- Per-category preferences
- Global enable/disable

### Preference Enforcement

**Preference Check**:

- Before sending notification, check user preferences
- Skip notification if disabled for event type
- Respect quiet hours (don't send during quiet hours)
- Log skipped notifications for audit

**Quiet Hours Implementation**:

```typescript
export class QuietHoursChecker {
  isQuietHours(preference: NotificationPreference): boolean {
    if (!preference.quietHoursStart || !preference.quietHoursEnd) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const start = preference.quietHoursStart;
    const end = preference.quietHoursEnd;

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (start > end) {
      return currentTime >= start || currentTime <= end;
    }

    // Handle same-day quiet hours (e.g., 22:00 to 08:00 next day)
    return currentTime >= start && currentTime <= end;
  }
}
```

## Database Schema

### NotificationDelivery Model

```prisma
model NotificationDelivery {
  id              String   @id @default(cuid())
  eventId         String   // Kafka event ID
  eventType       String   // Event type (e.g., "EscrowFundsHeld")
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  discordUserId   String   // Discord user ID
  status          NotificationStatus @default(PENDING)
  retryCount      Int      @default(0)
  lastAttemptAt   DateTime?
  sentAt          DateTime?
  failedAt        DateTime?
  errorMessage    String?
  discordMessageId String? // Discord message ID if successful
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([eventId, userId]) // Prevent duplicate notifications
  @@index([userId])
  @@index([status])
  @@index([eventType])
  @@index([createdAt])
  @@index([status, createdAt]) // For retry processing
  @@map("notification_deliveries")
}

enum NotificationStatus {
  PENDING
  SENT
  FAILED
  RETRYING
}
```

### NotificationPreference Model

```prisma
model NotificationPreference {
  id              String   @id @default(cuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  eventType       String   // Event type or category
  channel         NotificationChannel @default(DISCORD_DM)
  enabled         Boolean  @default(true)
  quietHoursStart String?  // HH:mm format (e.g., "22:00")
  quietHoursEnd   String?  // HH:mm format (e.g., "08:00")
  
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  @@unique([userId, eventType, channel])
  @@index([userId])
  @@index([eventType])
  @@index([userId, enabled]) // For filtering enabled preferences
  @@map("notification_preferences")
}

enum NotificationChannel {
  DISCORD_DM
  EMAIL       // Future
  PUSH        // Future
}
```

### User Model Updates

Add relations to User model:

```prisma
model User {
  // ... existing fields ...
  
  notificationDeliveries NotificationDelivery[]
  notificationPreferences NotificationPreference[]
}
```

## Kafka Consumer Implementation

### Consumer Setup

**Consumer Configuration**:

- Group ID: `notifications-service`
- Auto offset reset: `latest`
- Enable auto commit: `false` (manual commit)
- Max poll records: 10
- Session timeout: 30 seconds

**Consumer Implementation**:

```typescript
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';

export class KafkaConsumer {
  private consumer: Consumer;
  private handlers: Map<string, EventHandler<unknown>> = new Map();
  private isRunning = false;

  constructor(
    private kafka: Kafka,
    private prisma: PrismaClient,
    private discordClient: DiscordClient
  ) {
    this.consumer = this.kafka.consumer({
      groupId: 'notifications-service',
      allowAutoTopicCreation: false,
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: ['escrow.events.v1', 'payments.events.v1'],
      fromBeginning: false,
    });

    this.isRunning = true;

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.consumer.disconnect();
  }

  registerHandler(eventType: string, handler: EventHandler<unknown>): void {
    this.handlers.set(eventType, handler);
  }

  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    try {
      const event = this.deserializeEvent(payload.message.value);
      const eventId = payload.message.headers?.['event-id'] as string;
      const eventType = payload.message.headers?.['event-type'] as string;

      if (!eventId || !eventType) {
        console.error('Missing event headers:', payload.message.headers);
        return;
      }

      const handler = this.handlers.get(eventType);
      if (!handler) {
        console.warn(`No handler registered for event type: ${eventType}`);
        return;
      }

      await handler.handle(event, eventId);

      // Commit offset after successful processing
      // Note: In production, consider committing after processing all messages in batch
    } catch (error) {
      console.error(`Error processing event ${eventType}:`, error);
      // Don't commit offset on error - allows retry
      // Consider dead letter queue for persistent failures
    }
  }

  private deserializeEvent(buffer: Buffer): unknown {
    // Deserialize Protobuf message
    // Implementation depends on Protobuf schema definitions
    // Example using protobufjs:
    const { EscrowCreated } = require('./generated/escrow_pb');
    const message = EscrowCreated.deserializeBinary(buffer);
    return {
      escrowId: message.getEscrowId(),
      amount: message.getAmount(),
      currency: message.getCurrency(),
      timestamp: message.getTimestamp(),
    };
  }
}
```

### Consumer Loop

**Processing Flow**:

1. Poll Kafka for events
2. For each event:
   - Deserialize Protobuf payload
   - Extract event type and user IDs
   - Check idempotency (NotificationDelivery table)
   - Check user preferences
   - Fetch user data (buyer/seller names, Discord IDs) from database
   - Build notification embed using template functions
   - Send Discord DM using `sendDMWithEmbed`
   - Record delivery attempt in NotificationDelivery table
3. Commit offsets after successful processing

### Event-Driven vs Polling

**Key Difference from Discord Bot**:

- Current Discord bot uses **polling** (OfferNotificationService, LinkNotificationService poll API every 30s)
- Notifications Service uses **event-driven** architecture (consumes Kafka events)
- Real-time notification delivery (no polling delay)
- Better scalability and decoupling

### Error Handling

**Consumer Error Handling**:

- Catch and log all errors
- Don't crash consumer on individual event failures
- Dead letter queue for persistent failures
- Health check endpoint for monitoring
- Retry logic for transient failures (Discord API errors)

## Implementation Details

### Event Handler Base Class

**Abstract Handler**:

- Common error handling
- Idempotency check
- Preference check
- Template rendering (calling embed builder functions)
- Discord sending (using `sendDMWithEmbed`)
- Delivery recording

**Complete Base Handler** (see Event Handler Pattern section above for full implementation)

### Template Functions

**Template Management**:

- TypeScript functions returning EmbedBuilder instances
- Located in `src/templates/` directory
- Reuse `formatCurrency` utility from shared utilities
- Cache template function references (no compilation needed)
- Follow existing patterns from `offerEmbeds.ts`

**Template Registry**:

```typescript
export class TemplateRegistry {
  private templates: Map<string, (data: unknown) => EmbedBuilder> = new Map();

  register(eventType: string, builder: (data: unknown) => EmbedBuilder): void {
    this.templates.set(eventType, builder);
  }

  get(eventType: string): ((data: unknown) => EmbedBuilder) | undefined {
    return this.templates.get(eventType);
  }

  build(eventType: string, data: unknown): EmbedBuilder {
    const builder = this.templates.get(eventType);
    if (!builder) {
      throw new Error(`No template found for event type: ${eventType}`);
    }
    return builder(data);
  }
}
```

### Discord Client Wrapper

**Discord Client Wrapper**:

- Rate limit management
- Error handling and retry logic
- User fetching with caching
- DM sending with fallback handling (reuse `sendDMWithEmbed`)

**User Cache Implementation**:

```typescript
export class UserCache {
  private cache: Map<string, { user: User; timestamp: number }> = new Map();
  private readonly ttl = 5 * 60 * 1000; // 5 minutes

  async getUser(discordUserId: string): Promise<User | null> {
    const cached = this.cache.get(discordUserId);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.user;
    }

    try {
      const user = await this.discordClient.getClient().users.fetch(discordUserId);
      this.cache.set(discordUserId, {
        user,
        timestamp: Date.now(),
      });
      return user;
    } catch (error) {
      console.error(`Failed to fetch user ${discordUserId}:`, error);
      return null;
    }
  }

  invalidate(discordUserId: string): void {
    this.cache.delete(discordUserId);
  }
}
```

## Monitoring and Observability

### Metrics

**Key Metrics**:

- Notification delivery rate
- Notification failure rate
- Average delivery latency
- Retry count distribution
- Discord API rate limit hits

**Metrics Implementation**:

```typescript
export class MetricsCollector {
  private deliveryCount = 0;
  private failureCount = 0;
  private retryCount = 0;
  private rateLimitHits = 0;
  private latencies: number[] = [];

  recordDelivery(latency: number): void {
    this.deliveryCount++;
    this.latencies.push(latency);
    // Keep only last 1000 latencies
    if (this.latencies.length > 1000) {
      this.latencies.shift();
    }
  }

  recordFailure(): void {
    this.failureCount++;
  }

  recordRetry(): void {
    this.retryCount++;
  }

  recordRateLimit(): void {
    this.rateLimitHits++;
  }

  getMetrics(): Metrics {
    return {
      deliveryRate: this.deliveryCount,
      failureRate: this.failureCount,
      retryCount: this.retryCount,
      rateLimitHits: this.rateLimitHits,
      averageLatency:
        this.latencies.length > 0
          ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
          : 0,
    };
  }
}
```

### Logging

**Log Events**:

- Notification sent (success)
- Notification failed (with error)
- Notification skipped (preference)
- Retry attempt
- Dead letter queue entry

**Structured Logging**:

```typescript
export class Logger {
  logNotificationSent(
    eventId: string,
    userId: string,
    eventType: string,
    latency: number
  ): void {
    console.log(JSON.stringify({
      level: 'info',
      event: 'notification_sent',
      eventId,
      userId,
      eventType,
      latency,
      timestamp: new Date().toISOString(),
    }));
  }

  logNotificationFailed(
    eventId: string,
    userId: string,
    eventType: string,
    error: string
  ): void {
    console.error(JSON.stringify({
      level: 'error',
      event: 'notification_failed',
      eventId,
      userId,
      eventType,
      error,
      timestamp: new Date().toISOString(),
    }));
  }

  logNotificationSkipped(
    eventId: string,
    userId: string,
    eventType: string,
    reason: string
  ): void {
    console.log(JSON.stringify({
      level: 'info',
      event: 'notification_skipped',
      eventId,
      userId,
      eventType,
      reason,
      timestamp: new Date().toISOString(),
    }));
  }
}
```

### Health Checks

**Health Check Endpoint**:

- Discord API connectivity
- Kafka consumer status
- Database connectivity
- Template loading status

**Health Check Implementation**:

```typescript
export class HealthCheckService {
  async checkHealth(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDiscord(),
      this.checkKafka(),
      this.checkDatabase(),
      this.checkTemplates(),
    ]);

    return {
      status: checks.every(c => c.status === 'fulfilled') ? 'healthy' : 'unhealthy',
      discord: checks[0].status === 'fulfilled' ? 'ok' : 'error',
      kafka: checks[1].status === 'fulfilled' ? 'ok' : 'error',
      database: checks[2].status === 'fulfilled' ? 'ok' : 'error',
      templates: checks[3].status === 'fulfilled' ? 'ok' : 'error',
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDiscord(): Promise<void> {
    // Check Discord client is connected
    if (!this.discordClient.getClient().isReady()) {
      throw new Error('Discord client not ready');
    }
  }

  private async checkKafka(): Promise<void> {
    // Check Kafka consumer is connected
    if (!this.kafkaConsumer.isRunning) {
      throw new Error('Kafka consumer not running');
    }
  }

  private async checkDatabase(): Promise<void> {
    // Check database connectivity
    await this.prisma.$queryRaw`SELECT 1`;
  }

  private async checkTemplates(): Promise<void> {
    // Check templates are loaded
    const requiredTemplates = [
      'EscrowCreated',
      'EscrowFundsHeld',
      'EscrowDelivered',
      'EscrowReleased',
      'EscrowRefunded',
      'EscrowDisputed',
      'PaymentIntentCreated',
      'PaymentSucceeded',
      'PaymentFailed',
      'TransferSucceeded',
      'RefundSucceeded',
    ];

    for (const template of requiredTemplates) {
      if (!this.templateRegistry.get(template)) {
        throw new Error(`Template ${template} not loaded`);
      }
    }
  }
}
```

## Existing vs New Implementation

### Existing Notification Services (Discord Bot)

**Current Implementation** (`apps/discord-bot/src/services/`):

1. **OfferNotificationService**:
   - Handles offer events: created, accepted, declined, countered
   - Architecture: HTTP polling (`GET /api/offers/events/recent`) every 30 seconds
   - Delay: Up to 30 seconds between event and notification
   - Location: Discord bot application
   - Data source: API endpoint polling

2. **LinkNotificationService**:
   - Handles account linking notifications (Roblox account linked)
   - Architecture: HTTP polling (`GET /api/users/link-events/pending`) every 30 seconds
   - Delay: Up to 30 seconds between event and notification
   - Location: Discord bot application
   - Data source: API endpoint polling

3. **Contract Notification Functions** (`contract-notifications.ts`):
   - Handles contract signing notifications
   - Architecture: Direct function calls from API (not polling)
   - Delay: Immediate (when called)
   - Location: Discord bot application
   - Data source: API/command handlers (called directly from `contracts.ts` routes)

### New Notifications Service

**New Implementation** (`apps/notifications-service/`):

- Handles escrow events: created, funds held, delivered, released, refunded, disputed
- Handles payment events: intent created, succeeded, failed, transfer succeeded, refund succeeded
- Architecture: Event-driven via Kafka (consumes `escrow.events.v1` and `payments.events.v1`)
- Delay: Real-time (event-driven, no polling delay)
- Location: Separate microservice
- Data source: Kafka event stream

### Key Differences

| Aspect | Existing (Discord Bot) | New (Notifications Service) |
|--------|------------------------|----------------------------|
| **Architecture** | HTTP Polling (30s interval) | Event-driven (Kafka) |
| **Delay** | Up to 30 seconds | Real-time |
| **Scope** | Offers, Links, Contracts | Escrow, Payments |
| **Location** | Discord bot app | Separate service |
| **Scalability** | Limited by polling rate | Scales with Kafka partitions |
| **Decoupling** | Tightly coupled to API | Decoupled via events |

### Contract Handling Clarification

**Important**: According to the Escrow Service design:
- **Contracts are handled by the API** (`apps/api/src/routes/contracts.ts`)
  - Contract generation: `POST /api/contracts/generate` (API)
  - Contract execution: `executeContract()` function (API)
  - Contract signing: API endpoints
- **Escrow Service handles escrow lifecycle** (after contract is EXECUTED)
  - Receives `CreateEscrowCommand` from API after contract execution
  - Creates escrow and manages escrow state machine
  - Emits escrow events to Kafka

**Contract Notifications**:
- Currently handled by Discord bot (`contract-notifications.ts`)
- Called directly from API routes (not polling)
- Would need to migrate to event-driven if moved to Notifications Service
- Requires API to emit contract events to Kafka (not currently implemented)

## Service Separation Decision

### Decision: Keep Notification Systems Separate

The Notifications Service and Discord Bot notification services will operate independently with distinct responsibilities:

**Notifications Service Scope** (New - Event-Driven):

- **Escrow Events**: created, funds held, delivered, released, refunded, disputed
- **Payment Events**: intent created, succeeded, failed, transfer succeeded, refund succeeded
- **Architecture**: Event-driven via Kafka (consumes `escrow.events.v1` and `payments.events.v1`)
- **Purpose**: Transaction lifecycle notifications (escrow/payment flow)

**Discord Bot Notification Scope** (Existing - Polling/Direct Calls):

- **Offer Events**: created, accepted, declined, countered
- **Link Events**: account linked
- **Contract Events**: contract ready, signed, executed
- **Architecture**: HTTP polling or direct function calls
- **Purpose**: User interaction notifications (offers, contracts, account setup)

### Separation Benefits

1. **Clear Boundaries**: Transaction lifecycle vs user interactions
2. **Independent Scaling**: Each system scales based on its workload
3. **No Migration Complexity**: No need to migrate existing Discord bot services
4. **Technology Fit**: Event-driven for transactions, polling/direct calls for interactions
5. **Lower Risk**: Build new service without disrupting existing functionality

### Coexistence

- Both systems operate independently
- No conflicts (different event types and purposes)
- Users receive notifications from both systems seamlessly
- Each system focuses on its domain (transactions vs interactions)

## Summary

This design document provides a complete blueprint for implementing the Notifications Service with:

- **Discord DM Integration**: Reuses existing utilities from Discord bot
- **Event Subscription**: Kafka consumer for escrow and payment events (event-driven, not polling)
- **Notification Templates**: TypeScript embed builder functions matching existing patterns
- **Retry Logic**: Exponential backoff for transient failures
- **Notification Preferences**: User-controlled notification settings

The service is designed to be:

- **Reliable**: Idempotent processing and retry logic
- **Scalable**: Kafka-based event consumption with parallel processing
- **User-Friendly**: Respects user preferences and quiet hours
- **Maintainable**: Clear separation of concerns and comprehensive error handling
- **Consistent**: Follows existing notification patterns and styling

