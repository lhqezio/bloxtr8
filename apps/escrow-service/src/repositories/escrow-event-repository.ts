import type { EscrowEvent, PrismaClient, Prisma } from '@bloxtr8/database';
import {
  checkEscrowEventIdempotency,
  createEscrowEventIdempotent,
} from '@bloxtr8/shared';

/**
 * Error thrown when escrow event is not found
 */
export class EscrowEventNotFoundError extends Error {
  constructor(public readonly eventId: string) {
    super(`Escrow event with id ${eventId} not found`);
    this.name = 'EscrowEventNotFoundError';
  }
}

/**
 * Input type for creating an escrow event
 */
export interface CreateEscrowEventInput {
  escrowId: string;
  eventType: string;
  payload: Record<string, unknown> & { eventId?: string; event_id?: string };
  version?: number;
}

/**
 * Query options for finding events
 */
export interface QueryOptions {
  skip?: number;
  take?: number;
  orderBy?:
    | Prisma.EscrowEventOrderByWithRelationInput
    | Prisma.EscrowEventOrderByWithRelationInput[];
  where?: Prisma.EscrowEventWhereInput;
}

/**
 * Options for findMany operations
 */
export interface FindManyOptions {
  where?: Prisma.EscrowEventWhereInput;
  orderBy?:
    | Prisma.EscrowEventOrderByWithRelationInput
    | Prisma.EscrowEventOrderByWithRelationInput[];
  skip?: number;
  take?: number;
}

/**
 * Repository for escrow event database operations with idempotency support.
 *
 * This repository provides CRUD operations for escrow event entities with built-in
 * idempotency checking to prevent duplicate event processing.
 */
export class EscrowEventRepository {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a new escrow event record.
   *
   * @param input - Escrow event creation data
   * @returns The created escrow event
   */
  async create(input: CreateEscrowEventInput): Promise<EscrowEvent> {
    return await this.prisma.escrowEvent.create({
      data: {
        escrowId: input.escrowId,
        eventType: input.eventType,
        payload: input.payload as Prisma.InputJsonValue,
        version: input.version ?? 1,
      },
    });
  }

  /**
   * Atomically creates an escrow event with idempotency protection.
   * If an event with the same eventId already exists, returns the existing event.
   * Otherwise, creates a new event.
   *
   * The eventId must be included in the payload as either 'eventId' or 'event_id'.
   *
   * @param input - Escrow event creation data (must include eventId in payload)
   * @returns The created or existing escrow event
   * @throws Error if eventId is not provided in payload
   */
  async createIdempotent(input: CreateEscrowEventInput): Promise<EscrowEvent> {
    const result = await createEscrowEventIdempotent(this.prisma, {
      escrowId: input.escrowId,
      eventType: input.eventType,
      payload: input.payload,
      version: input.version,
    });
    // Cast to EscrowEvent since createEscrowEventIdempotent returns payload as unknown
    // but EscrowEvent expects JsonValue (which is compatible)
    return result as EscrowEvent;
  }

  /**
   * Finds an escrow event by ID.
   *
   * @param id - Escrow event ID
   * @returns The escrow event if found, null otherwise
   */
  async findById(id: string): Promise<EscrowEvent | null> {
    return await this.prisma.escrowEvent.findUnique({
      where: { id },
    });
  }

  /**
   * Finds an escrow event by ID or throws an error if not found.
   *
   * @param id - Escrow event ID
   * @returns The escrow event
   * @throws EscrowEventNotFoundError if event is not found
   */
  async findByIdOrThrow(id: string): Promise<EscrowEvent> {
    const event = await this.findById(id);
    if (!event) {
      throw new EscrowEventNotFoundError(id);
    }
    return event;
  }

  /**
   * Finds escrow events by escrow ID.
   *
   * @param escrowId - Escrow ID
   * @param options - Optional query options for pagination, ordering, and filtering
   * @returns Array of escrow events
   */
  async findByEscrowId(
    escrowId: string,
    options?: QueryOptions
  ): Promise<EscrowEvent[]> {
    return await this.prisma.escrowEvent.findMany({
      where: {
        escrowId,
        ...options?.where,
      },
      orderBy: options?.orderBy ?? { createdAt: 'asc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  /**
   * Finds escrow events by event type.
   *
   * @param eventType - Event type to search for
   * @param options - Optional query options for pagination, ordering, and filtering
   * @returns Array of escrow events
   */
  async findByEventType(
    eventType: string,
    options?: QueryOptions
  ): Promise<EscrowEvent[]> {
    return await this.prisma.escrowEvent.findMany({
      where: {
        eventType,
        ...options?.where,
      },
      orderBy: options?.orderBy ?? { createdAt: 'asc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  /**
   * Checks if an event with the given eventId already exists (idempotency check).
   *
   * @param eventId - The event ID to check
   * @param escrowId - The escrow ID to scope the check to
   * @returns `true` if the event already exists, `false` otherwise
   */
  async checkIdempotency(eventId: string, escrowId: string): Promise<boolean> {
    return await checkEscrowEventIdempotency(this.prisma, eventId, escrowId);
  }

  /**
   * Counts escrow events matching the given criteria.
   *
   * @param where - Prisma where clause
   * @returns Count of matching escrow events
   */
  async count(where?: Prisma.EscrowEventWhereInput): Promise<number> {
    return await this.prisma.escrowEvent.count({
      where,
    });
  }

  /**
   * Finds escrow events with pagination support.
   *
   * @param options - Query options including pagination
   * @returns Paginated escrow events and total count
   */
  async findMany(options?: FindManyOptions): Promise<{
    events: EscrowEvent[];
    total: number;
  }> {
    const [events, total] = await Promise.all([
      this.prisma.escrowEvent.findMany({
        where: options?.where,
        orderBy: options?.orderBy ?? { createdAt: 'asc' },
        skip: options?.skip,
        take: options?.take,
      }),
      this.count(options?.where),
    ]);

    return { events, total };
  }

  /**
   * Creates a repository instance that uses a transaction client.
   * Useful for operations that need to be part of a larger transaction.
   *
   * @param tx - Prisma transaction client
   * @returns A new EscrowEventRepository instance using the transaction client
   */
  withTransaction(tx: Prisma.TransactionClient): EscrowEventRepository {
    return new EscrowEventRepository(tx as unknown as PrismaClient);
  }
}
