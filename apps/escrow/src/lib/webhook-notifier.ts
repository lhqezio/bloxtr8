import crypto from 'crypto';

export class WebhookNotifier {
    private apiServerUrl: string;
    private webhookSecret: string;
  
    constructor() {
      this.apiServerUrl = process.env.API_SERVER_URL || 'http://localhost:3000';
      this.webhookSecret = process.env.ESCROW_WEBHOOK_SECRET || 'dev-secret';
    }
  
    async notifyEscrowStatusUpdate(data: {
      escrowId: string;
      status: string;
      paymentIntentId?: string;
      transferId?: string;
      refundId?: string;
      reason?: string;
    }) {
      try {
        const payload = JSON.stringify(data);
        const signature = crypto
          .createHmac('sha256', this.webhookSecret)
          .update(payload)
          .digest('hex');
  
        const response = await fetch(`${this.apiServerUrl}/api/webhooks/escrow-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-escrow-signature': signature,
          },
          body: payload,
        });
  
        if (!response.ok) {
          console.error(`Failed to notify API server: ${response.status}`);
        }
      } catch (error) {
        console.error('Error notifying API server:', error);
      }
    }
  }