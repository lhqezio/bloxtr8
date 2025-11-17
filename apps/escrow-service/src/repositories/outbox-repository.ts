import type { Outbox, PrismaClient, Prisma } from '@bloxtr8/database';

/**
 * Error thrown when outbox event is not found
 */
export class OutboxNotFoundError extends Error {
  constructor(public readonly outboxId: string) {
    super(`Outbox event with id ${outboxId} not found`);
    this.name = 'OutboxNotFoundError';
  }
}

/**
 * Input type for creating an outbox event
 */
export interface CreateOutboxInput {
  aggregateId: string;
  eventType: string;
  payload: Buffer; // Protobuf-serialized bytes
  version?: number;
}

/**
 * Query options for finding events
 */
export interface QueryOptions {
  skip?: number;
  take?: number;
  orderBy?:
    | Prisma.OutboxOrderByWithRelationInput
    | Prisma.OutboxOrderByWithRelationInput[];
  where?: Prisma.OutboxWhereInput;
}

/**
 * Options for findMany operations
 */
export interface FindManyOptions {
  where?: Prisma.OutboxWhereInput;
  orderBy?:
    | Prisma.OutboxOrderByWithRelationInput
    | Prisma.OutboxOrderByWithRelationInput[];
  skip?: number;
  take?: number;
}

/**
 * Repository for outbox database operations with reliable event publishing support.
 *
 * This repository provides CRUD operations for outbox events with built-in
 * support for marking events as published, enabling reliable event publishing
 * using the transactional outbox pattern.
 */
export class OutboxRepository {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a new outbox event record.
   *
   * @param input - Outbox event creation data
   * @returns The created outbox event
   */
  async create(input: CreateOutboxInput): Promise<Outbox> {
    return await this.prisma.outbox.create({
      data: {
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload, // Buffer is directly compatible with Prisma Bytes
        version: input.version ?? 1,
      },
    });
  }

  /**
   * Finds an outbox event by ID.
   *
   * @param id - Outbox event ID
   * @returns The outbox event if found, null otherwise
   */
  async findById(id: string): Promise<Outbox | null> {
    return await this.prisma.outbox.findUnique({
      where: { id },
    });
  }

  /**
   * Finds an outbox event by ID or throws an error if not found.
   *
   * @param id - Outbox event ID
   * @returns The outbox event
   * @throws OutboxNotFoundError if event is not found
   */
  async findByIdOrThrow(id: string): Promise<Outbox> {
    const event = await this.findById(id);
    if (!event) {
      throw new OutboxNotFoundError(id);
    }
    return event;
  }

  /**
   * Finds outbox events by aggregate ID.
   *
   * @param aggregateId - Aggregate ID (e.g., escrowId)
   * @param options - Optional query options for pagination, ordering, and filtering
   * @returns Array of outbox events
   */
  async findByAggregateId(
    aggregateId: string,
    options?: QueryOptions
  ): Promise<Outbox[]> {
    return await this.prisma.outbox.findMany({
      where: {
        ...options?.where,
        aggregateId,
      },
      orderBy: options?.orderBy ?? { createdAt: 'asc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  /**
   * Finds outbox events by event type.
   *
   * @param eventType - Event type to search for
   * @param options - Optional query options for pagination, ordering, and filtering
   * @returns Array of outbox events
   */
  async findByEventType(
    eventType: string,
    options?: QueryOptions
  ): Promise<Outbox[]> {
    return await this.prisma.outbox.findMany({
      where: {
        ...options?.where,
        eventType,
      },
      orderBy: options?.orderBy ?? { createdAt: 'asc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  /**
   * Finds unpublished outbox events (where publishedAt IS NULL).
   *
   * @param options - Optional query options for pagination, ordering, and filtering
   * @returns Array of unpublished outbox events
   */
  async findUnpublished(options?: QueryOptions): Promise<Outbox[]> {
    return await this.prisma.outbox.findMany({
      where: {
        ...options?.where,
        publishedAt: null,
      },
      orderBy: options?.orderBy ?? { createdAt: 'asc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  /**
   * Atomically marks an event as published.
   * Uses updateMany with publishedAt: null condition for idempotency.
   * This ensures that only unpublished events can be marked as published,
   * preventing duplicate processing.
   *
   * @param id - Outbox event ID
   * @returns `true` if the event was successfully marked as published, `false` if it was already published
   * @throws OutboxNotFoundError if event doesn't exist
   */
  async markAsPublished(id: string): Promise<boolean> {
    // First check if event exists
    const event = await this.findById(id);
    if (!event) {
      throw new OutboxNotFoundError(id);
    }

    // Atomically update only if not already published
    const result = await this.prisma.outbox.updateMany({
      where: {
        id,
        publishedAt: null, // Only update if not already published
      },
      data: {
        publishedAt: new Date(),
      },
    });

    // Return true if a row was updated, false if already published
    return result.count > 0;
  }

  /**
   * Atomically marks an event as published within a transaction.
   * Uses updateMany with publishedAt: null condition for idempotency.
   * This ensures that only unpublished events can be marked as published,
   * preventing duplicate processing.
   *
   * This method is used by the outbox-publisher package to mark events
   * as published after successful Kafka publishing.
   *
   * @param tx - Prisma transaction client
   * @param id - Outbox event ID
   * @returns `true` if the event was successfully marked as published, `false` if it was already published
   */
  async markAsPublishedInTransaction(
    tx: Prisma.TransactionClient,
    id: string
  ): Promise<boolean> {
    try {
      const result = await tx.outbox.updateMany({
        where: {
          id,
          publishedAt: null, // Only update if not already published
        },
        data: {
          publishedAt: new Date(),
        },
      });

      // Return true if a row was updated, false if already published
      return result.count > 0;
    } catch (error) {
      // If update fails, check if event exists
      const event = await tx.outbox.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!event) {
        throw new OutboxNotFoundError(id);
      }

      // Re-throw original error if event exists
      throw error;
    }
  }

  /**
   * Counts outbox events matching the given criteria.
   *
   * @param where - Prisma where clause
   * @returns Count of matching outbox events
   */
  async count(where?: Prisma.OutboxWhereInput): Promise<number> {
    return await this.prisma.outbox.count({
      where,
    });
  }

  /**
   * Finds outbox events with pagination support.
   *
   * @param options - Query options including pagination
   * @returns Paginated outbox events and total count
   */
  async findMany(options?: FindManyOptions): Promise<{
    events: Outbox[];
    total: number;
  }> {
    const [events, total] = await Promise.all([
      this.prisma.outbox.findMany({
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
   * @returns A new OutboxRepository instance using the transaction client
   */
  withTransaction(tx: Prisma.TransactionClient): OutboxRepository {
    return new OutboxRepository(tx as unknown as PrismaClient);
  }
}
