// Core domain types
export interface User {
  id: string;
  discordId: string;
  username: string;
  email?: string;
  phone?: string;
  kycTier: 'TIER_1' | 'TIER_2';
  kycVerified: boolean;
  walletAddress?: string;
  walletRisk: 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH' | 'SANCTIONED';
  createdAt: Date;
  updatedAt: Date;
}

export interface Listing {
  id: string;
  title: string;
  summary: string;
  price: string; // in cents (stored as BigInt, serialized as string)
  category: string;
  status: 'ACTIVE' | 'INACTIVE' | 'SOLD';
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Offer {
  id: string;
  amount: string; // in cents (stored as BigInt, serialized as string)
  currency: 'USD' | 'USDC';
  conditions?: string;
  expiry: Date;
  status: 'PENDING' | 'ACCEPTED' | 'COUNTERED' | 'DECLINED' | 'EXPIRED';
  listingId: string;
  buyerId: string;
  sellerId: string;
  parentId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contract {
  id: string;
  pdfUrl?: string;
  sha256?: string;
  status: 'PENDING_SIGNATURE' | 'EXECUTED' | 'EXECUTION_FAILED' | 'VOID';
  offerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Escrow {
  id: string;
  rail: 'STRIPE' | 'USDC_BASE';
  amount: string; // in cents (stored as BigInt, serialized as string)
  currency: 'USD' | 'USDC';
  status:
    | 'AWAIT_FUNDS'
    | 'FUNDS_HELD'
    | 'DELIVERED'
    | 'RELEASED'
    | 'DISPUTED'
    | 'REFUNDED'
    | 'CANCELLED';
  offerId: string;
  contractId: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Response types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Discord interaction types
export interface DiscordInteraction {
  type: number;
  data?: {
    name?: string;
    options?: Array<{
      name: string;
      value: string | number | boolean;
    }>;
  };
  member?: {
    user: {
      id: string;
      username: string;
    };
  };
}

// Webhook types
export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
}

export interface CustodianWebhookEvent {
  id: string;
  type: string;
  data: {
    address: string;
    transactionHash: string;
    amount: string;
  };
}

// Roblox API types
export interface RobloxGroupData {
  id: number;
  name: string;
  description: string;
  owner: {
    id: number;
    username: string;
  };
  memberCount: number;
  created: string;
}

// Environment variables
export interface Environment {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  DISCORD_BOT_TOKEN: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  CUSTODIAN_API_KEY: string;
  CUSTODIAN_WEBHOOK_SECRET: string;
  JWT_SECRET: string;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_S3_BUCKET: string;
  TRM_API_KEY: string;
  CHAINALYSIS_API_KEY: string;
  TRUSTED_PROXIES?: string; // Comma-separated list of trusted proxy IPs/CIDR ranges
}
