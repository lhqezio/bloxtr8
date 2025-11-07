// import {
//   type ActionRowBuilder,
//   type ButtonBuilder,
//   type Client,
//   type EmbedBuilder,
// } from 'discord.js';

// import {
//   buildCounterOfferEmbed,
//   buildOfferAcceptedEmbed,
//   buildOfferCreatedEmbed,
//   buildOfferDeclinedEmbed,
//   buildOfferActionButtons,
// } from '../utils/offerEmbeds.js';

// interface OfferEvent {
//   offerId: string;
//   status: string;
//   amount: string;
//   conditions?: string;
//   listingId: string;
//   listingTitle: string;
//   listingPrice: string;
//   threadId?: string;
//   channelId?: string;
//   buyerId: string;
//   buyerName?: string;
//   buyerDiscordId?: string;
//   sellerId: string;
//   sellerName?: string;
//   sellerDiscordId?: string;
//   parentOfferId?: string;
//   parentAmount?: string;
//   createdAt: string;
//   updatedAt: string;
// }

// export class OfferNotificationService {
//   private client: Client;
//   private apiBaseUrl: string;
//   private lastPollTime: Date;

//   private pollingInterval: ReturnType<typeof setInterval> | null = null;
//   private processedOffers: Set<string> = new Set();

//   // Track message IDs for cleanup
//   private offerMessageIds: Map<
//     string,
//     {
//       sellerDMId?: string;
//       buyerDMId?: string;
//       threadMessageId?: string;
//     }
//   > = new Map();
//   constructor(client: Client, apiBaseUrl: string) {
//     this.client = client;
//     this.apiBaseUrl = apiBaseUrl;
//     this.lastPollTime = new Date();
//   }

//   /**
//    * Start polling for offer events
//    */
//   start(intervalMs: number = 30000): void {
//     // 30 seconds default
//     console.log('Starting offer notification service...');

//     // Do initial poll
//     this.pollOfferEvents().catch(error => {
//       console.error('Initial offer poll failed:', error);
//     });

//     // Set up interval polling

//     this.pollingInterval = setInterval(() => {
//       this.pollOfferEvents().catch(error => {
//         console.error('Offer poll failed:', error);
//       });
//     }, intervalMs);

//     console.log(
//       `Offer notifications polling every ${intervalMs / 1000} seconds`
//     );
//   }

//   /**
//    * Get tracked message IDs for an offer
//    */
//   getOfferMessageIds(offerId: string): {
//     sellerDMId?: string;
//     buyerDMId?: string;
//     threadMessageId?: string;
//   } | null {
//     return this.offerMessageIds.get(offerId) || null;
//   }

//   /**
//    * Stop polling
//    */
//   stop(): void {
//     if (this.pollingInterval) {
//       clearInterval(this.pollingInterval);
//       this.pollingInterval = null;
//       console.log('Offer notification service stopped');
//     }
//   }

//   /**
//    * Poll API for recent offer events
//    */
//   private async pollOfferEvents(): Promise<void> {
//     try {
//       const response = await fetch(
//         `${this.apiBaseUrl}/api/offers/events/recent?since=${this.lastPollTime.toISOString()}`,
//         {
//           method: 'GET',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//         }
//       );

      if (!response.ok) {
        // Suppress 429 (Too Many Requests) errors - these are expected during rate limiting
        if (response.status === 429) {
          return;
        }
        console.error(`Failed to fetch offer events: ${response.statusText}`);
        return;
      }
//       if (!response.ok) {
//         console.error(`Failed to fetch offer events: ${response.statusText}`);
//         return;
//       }

//       const data = await response.json();
//       const events: OfferEvent[] = data.events || [];

//       // Update last poll time
//       this.lastPollTime = new Date();

//       // Process each event
//       for (const event of events) {
//         // Skip if already processed (using composite key of offerId + status + updatedAt)
//         const eventKey = `${event.offerId}-${event.status}-${event.updatedAt}`;
//         if (this.processedOffers.has(eventKey)) {
//           continue;
//         }

//         await this.processOfferEvent(event);

//         // Mark as processed
//         this.processedOffers.add(eventKey);

        // Clean up old processed offers (keep last 1000)
        if (this.processedOffers.size > 1000) {
          const toDelete = Array.from(this.processedOffers).slice(0, 500);
          toDelete.forEach(key => this.processedOffers.delete(key));
        }
      }
    } catch (error: any) {
      // Suppress connection errors when API server is not available
      if (
        error?.cause?.code === 'ECONNREFUSED' ||
        error?.code === 'ECONNREFUSED'
      ) {
        // Silently ignore connection refused errors (API server not ready)
        return;
      }
      console.error('Error polling offer events:', error);
    }
  }
//         // Clean up old processed offers (keep last 1000)
//         if (this.processedOffers.size > 1000) {
//           const toDelete = Array.from(this.processedOffers).slice(0, 500);
//           toDelete.forEach(key => this.processedOffers.delete(key));
//         }
//       }
//     } catch (error) {
//       console.error('Error polling offer events:', error);
//     }
//   }

//   /**
//    * Process individual offer event
//    */
//   private async processOfferEvent(event: OfferEvent): Promise<void> {
//     try {
//       // Determine event type based on status and creation/update time
//       const createdAt = new Date(event.createdAt);
//       const updatedAt = new Date(event.updatedAt);
//       const isNewOffer = updatedAt.getTime() - createdAt.getTime() < 5000; // Within 5 seconds

//       let eventType: 'created' | 'accepted' | 'declined' | 'countered' | null =
//         null;

//       if (event.status === 'PENDING' && isNewOffer) {
//         eventType = 'created';
//       } else if (event.status === 'ACCEPTED') {
//         eventType = 'accepted';
//       } else if (event.status === 'DECLINED') {
//         eventType = 'declined';
//       } else if (event.status === 'COUNTERED') {
//         eventType = 'countered';
//       }

//       if (!eventType) {
//         return; // Skip unknown event types
//       }

//       // Send notifications based on event type
//       switch (eventType) {
//         case 'created':
//           await this.handleOfferCreated(event);
//           break;
//         case 'accepted':
//           await this.handleOfferAccepted(event);
//           break;
//         case 'declined':
//           await this.handleOfferDeclined(event);
//           break;
//         case 'countered':
//           await this.handleOfferCountered(event);
//           break;
//       }
//     } catch (error) {
//       console.error(`Error processing offer event ${event.offerId}:`, error);
//     }
//   }

//   /**
//    * Handle offer created event
//    */
//   private async handleOfferCreated(event: OfferEvent): Promise<void> {
//     const embed = buildOfferCreatedEmbed(
//       {
//         offerId: event.offerId,
//         listingId: event.listingId,
//         buyerId: event.buyerId,
//         sellerId: event.sellerId,
//         amount: event.amount,
//         conditions: event.conditions,
//         timestamp: new Date(event.createdAt),
//       },
//       {
//         title: event.listingTitle,
//         price: event.listingPrice,
//         threadId: event.threadId,
//       },
//       {
//         id: event.buyerId,
//         name: event.buyerName,
//       }
//     );

//     const messageIds: {
//       sellerDMId?: string;
//       buyerDMId?: string;
//       threadMessageId?: string;
//     } = {};

//     // Send to listing thread if exists
//     if (event.threadId) {
//       const threadMessageId = await this.sendToThread(event.threadId, embed);
//       if (threadMessageId) {
//         messageIds.threadMessageId = threadMessageId;
//       }
//     }

//     // DM the seller with action buttons
//     if (event.sellerDiscordId) {
//       const buttons = buildOfferActionButtons(event.offerId);
//       const sellerDMId = await this.sendDMWithButtons(
//         event.sellerDiscordId,
//         embed,
//         buttons,
//         `You received a new offer on "${event.listingTitle}"`
//       );
//       if (sellerDMId) {
//         messageIds.sellerDMId = sellerDMId;
//       }
//     }

//     // Store message IDs for cleanup
//     this.offerMessageIds.set(event.offerId, messageIds);
//   }

//   /**
//    * Handle offer accepted event
//    */
//   private async handleOfferAccepted(event: OfferEvent): Promise<void> {
//     const embed = buildOfferAcceptedEmbed(
//       {
//         offerId: event.offerId,
//         listingId: event.listingId,
//         buyerId: event.buyerId,
//         sellerId: event.sellerId,
//         amount: event.amount,
//         timestamp: new Date(event.updatedAt),
//       },
//       {
//         title: event.listingTitle,
//         price: event.listingPrice,
//         threadId: event.threadId,
//       },
//       {
//         id: event.buyerId,
//         name: event.buyerName,
//       },
//       {
//         id: event.sellerId,
//         name: event.sellerName,
//       }
//     );

//     // Send to listing thread if exists
//     if (event.threadId) {
//       await this.sendToThread(event.threadId, embed);
//     }

//     // DM both buyer and seller
//     if (event.buyerDiscordId) {
//       await this.sendDM(
//         event.buyerDiscordId,
//         embed,
//         `Your offer was accepted for "${event.listingTitle}"!`
//       );
//     }
//     if (event.sellerDiscordId) {
//       await this.sendDM(
//         event.sellerDiscordId,
//         embed,
//         `You accepted an offer for "${event.listingTitle}"`
//       );
//     }
//   }

//   /**
//    * Handle offer declined event
//    */
//   private async handleOfferDeclined(event: OfferEvent): Promise<void> {
//     const embed = buildOfferDeclinedEmbed(
//       {
//         offerId: event.offerId,
//         listingId: event.listingId,
//         buyerId: event.buyerId,
//         sellerId: event.sellerId,
//         amount: event.amount,
//         timestamp: new Date(event.updatedAt),
//       },
//       {
//         title: event.listingTitle,
//         price: event.listingPrice,
//         threadId: event.threadId,
//       },
//       {
//         id: event.buyerId,
//         name: event.buyerName,
//       }
//     );

//     // DM the buyer
//     if (event.buyerDiscordId) {
//       await this.sendDM(
//         event.buyerDiscordId,
//         embed,
//         `Your offer was declined for "${event.listingTitle}"`
//       );
//     }
//   }

//   /**
//    * Handle counter offer event
//    */
//   private async handleOfferCountered(event: OfferEvent): Promise<void> {
//     if (!event.parentAmount) {
//       console.warn('Counter offer missing parent amount:', event.offerId);
//       return;
//     }

//     const embed = buildCounterOfferEmbed(
//       {
//         offerId: event.offerId,
//         listingId: event.listingId,
//         buyerId: event.buyerId,
//         sellerId: event.sellerId,
//         amount: event.amount,
//         conditions: event.conditions,
//         counterOfferId: event.offerId,
//         timestamp: new Date(event.updatedAt),
//       },
//       event.parentAmount,
//       {
//         title: event.listingTitle,
//         price: event.listingPrice,
//         threadId: event.threadId,
//       },
//       {
//         id: event.buyerId,
//         name: event.buyerName,
//       },
//       {
//         id: event.sellerId,
//         name: event.sellerName,
//       }
//     );

//     // Send to listing thread if exists
//     if (event.threadId) {
//       await this.sendToThread(event.threadId, embed);
//     }

//     // DM the original buyer (who now needs to respond to counter)
//     if (event.buyerDiscordId) {
//       await this.sendDM(
//         event.buyerDiscordId,
//         embed,
//         `Seller sent a counter offer for "${event.listingTitle}"`
//       );
//     }
//   }

//   /**
//    * Send embed to a thread
//    * Returns the message ID for cleanup purposes
//    */
//   private async sendToThread(
//     threadId: string,
//     embed: EmbedBuilder
//   ): Promise<string | null> {
//     try {
//       const thread = await this.client.channels.fetch(threadId);
//       if (thread && thread.isThread()) {
//         const message = await thread.send({ embeds: [embed] });
//         return message.id;
//       }
//     } catch (error) {
//       console.error(`Failed to send message to thread ${threadId}:`, error);
//     }
//     return null;
//   }

//   /**
//    * Send DM to a user
//    */
//   private async sendDM(
//     discordId: string,
//     embed: EmbedBuilder,
//     fallbackText: string
//   ): Promise<void> {
//     try {
//       const user = await this.client.users.fetch(discordId);
//       if (user) {
//         await user.send({ content: fallbackText, embeds: [embed] });
//       }
//     } catch (error) {
//       console.error(`Failed to send DM to user ${discordId}:`, error);
//     }
//   }

//   /**
//    * Send DM to a user with buttons
//    * Returns the message ID for cleanup purposes
//    */
//   private async sendDMWithButtons(
//     discordId: string,
//     embed: EmbedBuilder,
//     buttons: ActionRowBuilder<ButtonBuilder>,
//     fallbackText: string
//   ): Promise<string | null> {
//     try {
//       const user = await this.client.users.fetch(discordId);
//       if (user) {
//         const message = await user.send({
//           content: fallbackText,
//           embeds: [embed],
//           components: [buttons],
//         });
//         return message.id;
//       }
//     } catch (error) {
//       console.error(`Failed to send DM to user ${discordId}:`, error);
//     }
//     return null;
//   }
// }
