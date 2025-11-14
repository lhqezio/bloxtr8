import type {
  Escrow,
  EscrowRail,
  EscrowStatus,
  Currency,
} from '@bloxtr8/database';
import type { PrismaClient, Prisma } from '@bloxtr8/database';
import { Prisma as PrismaNamespace } from '@bloxtr8/database';

/**
 * Custom error for optimistic locking conflicts
 */
export class OptimisticLockingError extends Error {
  constructor(
    public readonly escrowId: string,
    public readonly expectedVersion: number,
    public readonly actualVersion: number
  ) {
    super(
      `Optimistic locking conflict for escrow ${escrowId}: expected version ${expectedVersion}, but actual version is ${actualVersion}`
    );
    this.name = 'OptimisticLockingError';
  }
}

/**
 * Error thrown when escrow is not found
 */
export class EscrowNotFoundError extends Error {
  constructor(public readonly escrowId: string) {
    super(`Escrow with id ${escrowId} not found`);
    this.name = 'EscrowNotFoundError';
  }
}

/**
 * Input type for creating an escrow
 */
export interface CreateEscrowInput {
  rail: EscrowRail;
  amount: bigint;
  currency?: Currency;
  status?: EscrowStatus;
  offerId: string;
  contractId: string;
  expiresAt?: Date | null;
  autoRefundAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Input type for updating an escrow
 */
export interface UpdateEscrowInput {
  rail?: EscrowRail;
  amount?: bigint;
  currency?: Currency;
  status?: EscrowStatus;
  expiresAt?: Date | null;
  autoRefundAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Options for update operations with optimistic locking
 */
export interface UpdateEscrowOptions {
  /**
   * Expected version for optimistic locking.
   * If provided, the update will only succeed if the current version matches.
   */
  expectedVersion?: number;
}

/**
 * Repository for escrow database operations with optimistic locking support.
 *
 * This repository provides CRUD operations for escrow entities with built-in
 * optimistic locking using the `version` field to prevent concurrent modification conflicts.
 */
export class EscrowRepository {
  // eslint-disable-next-line no-unused-vars
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a new escrow record.
   *
   * @param input - Escrow creation data
   * @returns The created escrow
   */
  async create(input: CreateEscrowInput): Promise<Escrow> {
    return await this.prisma.escrow.create({
      data: {
        rail: input.rail,
        amount: input.amount,
        currency: input.currency ?? 'USD',
        status: input.status ?? 'AWAIT_FUNDS',
        offerId: input.offerId,
        contractId: input.contractId,
        expiresAt: input.expiresAt,
        autoRefundAt: input.autoRefundAt,
        metadata:
          input.metadata === null
            ? PrismaNamespace.JsonNull
            : (input.metadata ?? undefined),
        version: 1, // Initial version
      },
    });
  }

  /**
   * Finds an escrow by ID.
   *
   * @param id - Escrow ID
   * @param include - Optional Prisma include options for relations
   * @returns The escrow if found, null otherwise
   */
  async findById(
    id: string,
    include?: Prisma.EscrowInclude
  ): Promise<Escrow | null> {
    return await this.prisma.escrow.findUnique({
      where: { id },
      include,
    });
  }

  /**
   * Finds an escrow by ID or throws an error if not found.
   *
   * @param id - Escrow ID
   * @param include - Optional Prisma include options for relations
   * @returns The escrow
   * @throws EscrowNotFoundError if escrow is not found
   */
  async findByIdOrThrow(
    id: string,
    include?: Prisma.EscrowInclude
  ): Promise<Escrow> {
    const escrow = await this.findById(id, include);
    if (!escrow) {
      throw new EscrowNotFoundError(id);
    }
    return escrow;
  }

  /**
   * Finds escrows by offer ID.
   *
   * @param offerId - Offer ID
   * @param include - Optional Prisma include options for relations
   * @returns Array of escrows
   */
  async findByOfferId(
    offerId: string,
    include?: Prisma.EscrowInclude
  ): Promise<Escrow[]> {
    return await this.prisma.escrow.findMany({
      where: { offerId },
      include,
    });
  }

  /**
   * Finds escrows by contract ID.
   *
   * @param contractId - Contract ID
   * @param include - Optional Prisma include options for relations
   * @returns Array of escrows
   */
  async findByContractId(
    contractId: string,
    include?: Prisma.EscrowInclude
  ): Promise<Escrow[]> {
    return await this.prisma.escrow.findMany({
      where: { contractId },
      include,
    });
  }

  /**
   * Finds escrows by status.
   *
   * @param status - Escrow status
   * @param include - Optional Prisma include options for relations
   * @returns Array of escrows
   */
  async findByStatus(
    status: EscrowStatus,
    include?: Prisma.EscrowInclude
  ): Promise<Escrow[]> {
    return await this.prisma.escrow.findMany({
      where: { status },
      include,
    });
  }

  /**
   * Finds escrows by rail type.
   *
   * @param rail - Escrow rail
   * @param include - Optional Prisma include options for relations
   * @returns Array of escrows
   */
  async findByRail(
    rail: EscrowRail,
    include?: Prisma.EscrowInclude
  ): Promise<Escrow[]> {
    return await this.prisma.escrow.findMany({
      where: { rail },
      include,
    });
  }

  /**
   * Updates an escrow with optimistic locking support.
   *
   * @param id - Escrow ID
   * @param input - Update data
   * @param options - Update options including expectedVersion for optimistic locking
   * @returns The updated escrow
   * @throws EscrowNotFoundError if escrow is not found
   * @throws OptimisticLockingError if version mismatch occurs
   */
  async update(
    id: string,
    input: UpdateEscrowInput,
    options?: UpdateEscrowOptions
  ): Promise<Escrow> {
    // If expectedVersion is provided, use optimistic locking
    if (options?.expectedVersion !== undefined) {
      return await this.updateWithOptimisticLock(
        id,
        input,
        options.expectedVersion
      );
    }

    // Otherwise, perform a regular update
    const { metadata, ...restInput } = input;
    const updateData: Prisma.EscrowUpdateInput = {
      ...restInput,
      version: { increment: 1 }, // Always increment version
    };

    // Handle null metadata properly
    if ('metadata' in input) {
      updateData.metadata =
        metadata === null ? PrismaNamespace.JsonNull : (metadata ?? undefined);
    }

    try {
      const escrow = await this.prisma.escrow.update({
        where: { id },
        data: updateData,
      });

      return escrow;
    } catch (error) {
      // Prisma throws P2025 when the record doesn't exist
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new EscrowNotFoundError(id);
      }
      throw error;
    }
  }

  /**
   * Updates an escrow with optimistic locking.
   * This method ensures that the update only succeeds if the current version
   * matches the expected version.
   *
   * @param id - Escrow ID
   * @param input - Update data
   * @param expectedVersion - Expected version number
   * @returns The updated escrow
   * @throws EscrowNotFoundError if escrow is not found
   * @throws OptimisticLockingError if version mismatch occurs
   */
  private async updateWithOptimisticLock(
    id: string,
    input: UpdateEscrowInput,
    expectedVersion: number
  ): Promise<Escrow> {
    // First, check if escrow exists and get current version
    const current = await this.prisma.escrow.findUnique({
      where: { id },
      select: { version: true },
    });

    if (!current) {
      throw new EscrowNotFoundError(id);
    }

    // Check version match
    if (current.version !== expectedVersion) {
      throw new OptimisticLockingError(id, expectedVersion, current.version);
    }

    // Perform update with version check in where clause
    try {
      const { metadata, ...restInput } = input;
      const updateData: Prisma.EscrowUpdateInput = {
        ...restInput,
        version: { increment: 1 },
      };

      // Handle null metadata properly
      if ('metadata' in input) {
        updateData.metadata =
          metadata === null
            ? PrismaNamespace.JsonNull
            : (metadata ?? undefined);
      }

      const updated = await this.prisma.escrow.update({
        where: {
          id,
          version: expectedVersion, // This ensures atomic check-and-update
        },
        data: updateData,
      });

      return updated;
    } catch (error) {
      // Prisma throws P2025 when the where clause doesn't match
      // This happens when version doesn't match
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        // Re-fetch to get actual version
        const actual = await this.prisma.escrow.findUnique({
          where: { id },
          select: { version: true },
        });

        if (!actual) {
          throw new EscrowNotFoundError(id);
        }

        throw new OptimisticLockingError(id, expectedVersion, actual.version);
      }

      throw error;
    }
  }

  /**
   * Updates an escrow status with optimistic locking.
   * Convenience method for status transitions.
   *
   * @param id - Escrow ID
   * @param status - New status
   * @param expectedVersion - Expected version number for optimistic locking
   * @returns The updated escrow
   * @throws EscrowNotFoundError if escrow is not found
   * @throws OptimisticLockingError if version mismatch occurs
   */
  async updateStatus(
    id: string,
    status: EscrowStatus,
    expectedVersion: number
  ): Promise<Escrow> {
    return await this.update(id, { status }, { expectedVersion });
  }

  /**
   * Deletes an escrow by ID.
   *
   * @param id - Escrow ID
   * @returns The deleted escrow
   * @throws EscrowNotFoundError if escrow is not found
   */
  async delete(id: string): Promise<Escrow> {
    try {
      return await this.prisma.escrow.delete({
        where: { id },
      });
    } catch (error) {
      if (
        error instanceof PrismaNamespace.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new EscrowNotFoundError(id);
      }
      throw error;
    }
  }

  /**
   * Counts escrows matching the given criteria.
   *
   * @param where - Prisma where clause
   * @returns Count of matching escrows
   */
  async count(where?: Prisma.EscrowWhereInput): Promise<number> {
    return await this.prisma.escrow.count({
      where,
    });
  }

  /**
   * Finds escrows with pagination support.
   *
   * @param options - Query options including pagination
   * @returns Paginated escrows and total count
   */
  async findMany(options?: {
    where?: Prisma.EscrowWhereInput;
    include?: Prisma.EscrowInclude;
    orderBy?:
      | Prisma.EscrowOrderByWithRelationInput
      | Prisma.EscrowOrderByWithRelationInput[];
    skip?: number;
    take?: number;
  }): Promise<{ escrows: Escrow[]; total: number }> {
    const [escrows, total] = await Promise.all([
      this.prisma.escrow.findMany({
        where: options?.where,
        include: options?.include,
        orderBy: options?.orderBy,
        skip: options?.skip,
        take: options?.take,
      }),
      this.count(options?.where),
    ]);

    return { escrows, total };
  }

  /**
   * Creates a repository instance that uses a transaction client.
   * Useful for operations that need to be part of a larger transaction.
   *
   * @param tx - Prisma transaction client
   * @returns A new EscrowRepository instance using the transaction client
   */
  withTransaction(tx: Prisma.TransactionClient): EscrowRepository {
    return new EscrowRepository(tx as unknown as PrismaClient);
  }
}
