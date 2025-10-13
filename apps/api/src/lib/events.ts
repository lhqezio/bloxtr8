import { EventEmitter } from 'events';

export enum OfferEventType {
  CREATED = 'offer.created',
  ACCEPTED = 'offer.accepted',
  DECLINED = 'offer.declined',
  COUNTERED = 'offer.countered',
  EXPIRED = 'offer.expired',
}

export interface OfferEvent {
  type: OfferEventType;
  offerId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  amount: bigint;
  counterOfferId?: string; // For counter offers
  parentOfferId?: string; // For tracking counter offer chain
  conditions?: string;
  timestamp: Date;
}

// Create singleton event emitter for offer events
export const offerEvents = new EventEmitter();

// Helper function to emit offer events
export function emitOfferEvent(event: OfferEvent): void {
  offerEvents.emit('offer', event);
  offerEvents.emit(event.type, event);
}

// Type-safe event listener
export function onOfferEvent(
  type: OfferEventType | 'offer',
  listener: (event: OfferEvent) => void
): void {
  offerEvents.on(type, listener);
}

