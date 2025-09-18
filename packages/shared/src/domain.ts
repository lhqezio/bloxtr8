/**
 * Domain enums for type-safe boundaries across the Bloxtr8 application
 */

/* eslint-disable no-unused-vars */

/**
 * Escrow state enumeration
 * Represents the current state of an escrow transaction
 */
export enum EscrowState {
  /** Waiting for funds to be deposited */
  AWAIT_FUNDS = 'AWAIT_FUNDS',
  /** Funds have been deposited and are being held */
  FUNDS_HELD = 'FUNDS_HELD',
  /** Goods/services have been delivered */
  DELIVERED = 'DELIVERED',
  /** Funds have been released to the seller */
  RELEASED = 'RELEASED',
  /** Transaction is under dispute */
  DISPUTED = 'DISPUTED',
  /** Funds have been refunded to the buyer */
  REFUNDED = 'REFUNDED',
  /** Transaction has been cancelled */
  CANCELLED = 'CANCELLED'
}

/**
 * Provider ID enumeration
 * Represents different service providers in the system
 */
export enum ProviderId {
  /** Stripe payment processor */
  STRIPE = 'STRIPE',
  /** USDC on Base blockchain */
  USDC_BASE = 'USDC_BASE',
  /** Discord platform */
  DISCORD = 'DISCORD',
  /** Roblox platform */
  ROBLOX = 'ROBLOX',
  /** AWS services */
  AWS = 'AWS',
  /** Chainalysis blockchain analytics */
  CHAINALYSIS = 'CHAINALYSIS',
  /** TRM blockchain analytics */
  TRM = 'TRM'
}

/**
 * Role enumeration
 * Represents user roles within the system
 */
export enum Role {
  /** Regular user with basic permissions */
  USER = 'USER',
  /** Moderator with elevated permissions */
  MODERATOR = 'MODERATOR',
  /** Administrator with full system access */
  ADMIN = 'ADMIN',
  /** System administrator with highest privileges */
  SUPER_ADMIN = 'SUPER_ADMIN'
}
