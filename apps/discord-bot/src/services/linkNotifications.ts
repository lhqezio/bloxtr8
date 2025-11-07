// import { type Client, EmbedBuilder } from 'discord.js';

// import { sendDMWithEmbed } from '../utils/dmHelper.js';

// interface LinkEvent {
//   id: string;
//   userId: string;
//   providerId: string;
//   accountId: string;
//   notified: boolean;
//   createdAt: string;
//   user: {
//     id: string;
//     name: string | null;
//     accounts: Array<{
//       accountId: string;
//     }>;
//   };
// }

// interface LinkEventsResponse {
//   success: boolean;
//   events: LinkEvent[];
// }

// export class LinkNotificationService {
//   private client: Client;
//   private apiBaseUrl: string;
//   private intervalId: ReturnType<typeof setInterval> | null = null;
//   private isRunning = false;

//   constructor(client: Client, apiBaseUrl: string) {
//     this.client = client;
//     this.apiBaseUrl = apiBaseUrl;
//   }

//   /**
//    * Start the link notification service
//    * @param intervalMs - Polling interval in milliseconds (default: 30 seconds)
//    */
//   start(intervalMs: number = 30000): void {
//     if (this.isRunning) {
//       console.warn('Link notification service is already running');
//       return;
//     }

//     this.isRunning = true;
//     this.intervalId = setInterval(() => {
//       this.checkForLinkEvents().catch(error => {
//         console.error('Error in link notification service:', error);
//       });
//     }, intervalMs);

//     console.log(
//       `✅ Link notification service started (polling every ${intervalMs / 1000}s)`
//     );

//     // Run an initial check immediately
//     this.checkForLinkEvents().catch(error => {
//       console.error('Error in initial link notification check:', error);
//     });
//   }

//   /**
//    * Stop the link notification service
//    */
//   stop(): void {
//     if (!this.isRunning) {
//       return;
//     }

//     if (this.intervalId) {
//       clearInterval(this.intervalId);
//       this.intervalId = null;
//     }

//     this.isRunning = false;
//     console.log('🛑 Link notification service stopped');
//   }

//   /**
//    * Check for pending link events and send notifications
//    */
//   private async checkForLinkEvents(): Promise<void> {
//     try {
//       const response = await fetch(
//         `${this.apiBaseUrl}/api/users/link-events/pending?limit=10`,
//         {
//           method: 'GET',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//           signal: AbortSignal.timeout(10000), // 10 second timeout
//         }
//       );

      // if (!response.ok) {
      //   // Suppress 429 (Too Many Requests) errors - these are expected during rate limiting
      //   if (response.status === 429) {
      //     return;
      //   }
      //   console.error(
      //     `Failed to fetch link events: ${response.status} ${response.statusText}`
      //   );
      //   return;
      // }
//       if (!response.ok) {
//         console.error(
//           `Failed to fetch link events: ${response.status} ${response.statusText}`
//         );
//         return;
//       }

//       const data = (await response.json()) as LinkEventsResponse;

//       if (!data.success || !data.events || data.events.length === 0) {
//         return; // No events to process
//       }

//       console.log(`📬 Processing ${data.events.length} link notification(s)`);

      // Process each link event
 //     for (const event of data.events) {
  //       await this.processLinkEvent(event);
  //     }
  //   } catch (error: any) {
  //     // Suppress connection errors when API server is not available
  //     if (
  //       error?.cause?.code === 'ECONNREFUSED' ||
  //       error?.code === 'ECONNREFUSED'
  //     ) {
  //       // Silently ignore connection refused errors (API server not ready)
  //       return;
  //     }
  //     console.error('Error checking for link events:', error);
  //   }
  // }
//       // Process each link event
//       for (const event of data.events) {
//         await this.processLinkEvent(event);
//       }
//     } catch (error) {
//       console.error('Error checking for link events:', error);
//     }
//   }

//   /**
//    * Process a single link event and send notification
//    */
//   private async processLinkEvent(event: LinkEvent): Promise<void> {
//     try {
//       // Get Discord user ID from the user's accounts
//       // The API already filters for Discord accounts, so we should have at least one
//       const discordAccount = event.user.accounts.find(
//         acc => acc.accountId // This is the Discord ID
//       );

//       if (!discordAccount) {
//         console.warn(`No Discord account found for user ${event.userId}`);
//         await this.markEventAsNotified(event.id);
//         return;
//       }

//       const discordUserId = discordAccount.accountId;
//       const discordUser = await this.client.users.fetch(discordUserId);

//       if (!discordUser) {
//         console.warn(`Discord user not found: ${discordUserId}`);
//         await this.markEventAsNotified(event.id);
//         return;
//       }

//       // Create success notification embed
//       const embed = new EmbedBuilder()
//         .setColor(0x00d4aa)
//         .setTitle('🎉 Roblox Account Linked!')
//         .setDescription(
//           '**Your Roblox account has been successfully connected to Bloxtr8!**'
//         )
//         .setThumbnail(discordUser.displayAvatarURL())
//         .addFields(
//           {
//             name: '🔗 **Connected Account**',
//             value: `Roblox ID: \`${event.accountId}\``,
//             inline: true,
//           },
//           {
//             name: '✅ **Status**',
//             value: '**Account verified and ready for trading**',
//             inline: true,
//           },
//           {
//             name: "🚀 **What's Next?**",
//             value:
//               '• Create listings with `/listing create`\n• Browse marketplace\n• Start trading securely',
//             inline: false,
//           }
//         )
//         .setFooter({
//           text: '🛡️ Bloxtr8 • Secure Trading Platform',
//           iconURL:
//             'https://cdn.discordapp.com/attachments/1234567890/1234567890/bloxtr8-logo.png',
//         })
//         .setTimestamp();

//       // Send DM notification
//       const dmResult = await sendDMWithEmbed(discordUser, embed);

//       if (dmResult.success) {
//         console.log(
//           `✅ Sent link notification to user ${discordUser.username} (${discordUserId})`
//         );
//       } else {
//         console.warn(
//           `⚠️ Failed to send link notification to user ${discordUser.username}: ${dmResult.error}`
//         );
//         // Still mark as notified to avoid retrying indefinitely
//       }

//       // Mark event as notified regardless of DM success
//       await this.markEventAsNotified(event.id);
//     } catch (error) {
//       console.error(`Error processing link event ${event.id}:`, error);
//       // Mark as notified to prevent infinite retries
//       await this.markEventAsNotified(event.id);
//     }
//   }

//   /**
//    * Mark a link event as notified
//    */
//   private async markEventAsNotified(eventId: string): Promise<void> {
//     try {
//       const response = await fetch(
//         `${this.apiBaseUrl}/api/users/link-events/${eventId}/notify`,
//         {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//           },
//           signal: AbortSignal.timeout(5000), // 5 second timeout
//         }
//       );

//       if (!response.ok) {
//         console.error(
//           `Failed to mark event ${eventId} as notified: ${response.status}`
//         );
//       }
//     } catch (error) {
//       console.error(`Error marking event ${eventId} as notified:`, error);
//     }
//   }

//   /**
//    * Get service status
//    */
//   getStatus(): { isRunning: boolean; intervalMs?: number } {
//     return {
//       isRunning: this.isRunning,
//     };
//   }
// }
