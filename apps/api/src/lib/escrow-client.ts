// apps/api/src/lib/escrow-client.ts
import { AppError } from '../middleware/errorHandler.js';

export interface CreateEscrowRequest {
  offerId: string;
  contractId: string;
  rail: 'STRIPE' | 'USDC_BASE';
  amount: string; // BigInt as string
  currency: 'USD' | 'USDC';
  buyerId: string;
  sellerId: string;
  sellerStripeAccountId?: string;
  buyerFee?: number;
  sellerFee?: number;
}

export interface CreateEscrowResponse {
  success: boolean;
  data: {
    escrowId: string;
    clientSecret?: string;
    paymentIntentId?: string;
    depositAddr?: string;
    qr?: string;
    status: string;
  };
}

export interface EscrowStatusUpdate {
  escrowId: string;
  status: string;
  paymentIntentId?: string;
  transferId?: string;
  refundId?: string;
  reason?: string;
}

export class EscrowClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = process.env.ESCROW_SERVER_URL || 'http://localhost:3001';
    this.apiKey = process.env.ESCROW_API_KEY || 'dev-key';
  }

  async createEscrow(params: CreateEscrowRequest): Promise<CreateEscrowResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/escrow/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new AppError(
          errorData.message || `Escrow server error: ${response.status}`,
          response.status
        );
      }

      return await response.json();
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        `Failed to create escrow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async getEscrowStatus(escrowId: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/escrow/${escrowId}`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new AppError(`Failed to get escrow status: ${response.status}`, response.status);
      }

      return await response.json();
    } catch (error) {
      throw new AppError(
        `Failed to get escrow status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  async transitionEscrowState(escrowId: string, newStatus: string, reason?: string): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/escrow/${escrowId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'x-user-id': 'system', // API server acts as system user
        },
        body: JSON.stringify({ newStatus, reason }),
      });

      if (!response.ok) {
        throw new AppError(`Failed to transition escrow: ${response.status}`, response.status);
      }

      return await response.json();
    } catch (error) {
      throw new AppError(
        `Failed to transition escrow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }
}