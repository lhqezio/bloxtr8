import { createHash } from 'crypto';

import type { PrismaClient } from '@bloxtr8/database';
import type { EscrowRail, Currency } from '@bloxtr8/database';
import type { KafkaProducer } from '@bloxtr8/kafka-client';
import {
  EscrowCreatedSchema,
  EscrowAwaitFundsSchema,
  CreatePaymentIntentSchema,
  type CreateEscrow,
} from '@bloxtr8/protobuf-schemas';
import { generateEventId, createEscrowEventIdempotent } from '@bloxtr8/shared';
import { create, toBinary } from '@bufbuild/protobuf';

import { OutboxRepository } from '../repositories/outbox-repository.js';

/**
 * Error thrown when command validation fails
 */
export class CreateEscrowValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateEscrowValidationError';
  }
}

/**
 * Error thrown when escrow already exists (idempotency check)
 */
export class EscrowAlreadyExistsError extends Error {
  constructor(public readonly escrowId: string) {
    super(`Escrow with id ${escrowId} already exists`);
    this.name = 'EscrowAlreadyExistsError';
  }
}

/**
 * Handles CreateEscrow command
 *
 * @param command - CreateEscrow protobuf command
 * @param prisma - Prisma client
 * @param producer - Kafka producer for emitting commands
 * @returns Promise that resolves when handler completes
 */
export async function handleCreateEscrow(
  command: CreateEscrow,
  prisma: PrismaClient,
  producer: KafkaProducer
): Promise<void> {
  // Validate command
  validateCommand(command);

  // Determine rail based on amount
  const amountInDollars = Number(command.amountCents) / 100;
  const rail: EscrowRail = amountInDollars <= 10000 ? 'STRIPE' : 'USDC_BASE';

  // Validate network matches rail
  if (rail === 'STRIPE' && command.network !== '') {
    throw new CreateEscrowValidationError(
      `Network must be empty for STRIPE rail, got: ${command.network}`
    );
  }
  if (rail === 'USDC_BASE' && command.network !== 'BASE') {
    throw new CreateEscrowValidationError(
      `Network must be "BASE" for USDC_BASE rail, got: ${command.network}`
    );
  }

  // Fetch contract to verify it exists and get offerId
  const contract = await prisma.contract.findUnique({
    where: { id: command.contractId },
    include: {
      offer: {
        select: {
          id: true,
          buyerId: true,
          sellerId: true,
          amount: true,
          currency: true,
        },
      },
    },
  });

  if (!contract) {
    throw new CreateEscrowValidationError(
      `Contract with id ${command.contractId} not found`
    );
  }

  if (!contract.offer) {
    throw new CreateEscrowValidationError(
      `Contract ${command.contractId} does not have an associated offer`
    );
  }

  // Verify buyer and seller IDs match
  if (contract.offer.buyerId !== command.buyerId) {
    throw new CreateEscrowValidationError(
      `Buyer ID mismatch: contract has ${contract.offer.buyerId}, command has ${command.buyerId}`
    );
  }

  if (contract.offer.sellerId !== command.sellerId) {
    throw new CreateEscrowValidationError(
      `Seller ID mismatch: contract has ${contract.offer.sellerId}, command has ${command.sellerId}`
    );
  }

  // Verify currency matches
  const expectedCurrency = contract.offer.currency as Currency;
  if (command.currency !== expectedCurrency) {
    throw new CreateEscrowValidationError(
      `Currency mismatch: contract has ${expectedCurrency}, command has ${command.currency}`
    );
  }

  // Verify amount matches (allowing for small rounding differences)
  const contractAmount = Number(contract.offer.amount);
  const commandAmount = Number(command.amountCents);
  if (Math.abs(contractAmount - commandAmount) > 1) {
    throw new CreateEscrowValidationError(
      `Amount mismatch: contract has ${contractAmount}, command has ${commandAmount}`
    );
  }

  const outboxRepository = new OutboxRepository(prisma);

  // Check if escrow already exists (idempotency)
  const existingEscrow = await prisma.escrow.findUnique({
    where: { id: command.escrowId },
  });
  if (existingEscrow) {
    throw new EscrowAlreadyExistsError(command.escrowId);
  }

  // Generate deterministic event IDs using business state hashing
  const occurredAt = new Date().toISOString();

  // Generate business state hash for EscrowCreated event
  // Includes all relevant business state fields that define the escrow creation
  const escrowCreatedBusinessState = JSON.stringify({
    contractId: command.contractId,
    buyerId: command.buyerId,
    sellerId: command.sellerId,
    currency: command.currency,
    amountCents: command.amountCents.toString(), // Convert BigInt to string for JSON
    network: command.network,
    rail,
  });
  const escrowCreatedBusinessStateHash = createHash('sha256')
    .update(escrowCreatedBusinessState)
    .digest('hex');

  const escrowCreatedEventId = generateEventId(
    command.escrowId,
    'EscrowCreated',
    escrowCreatedBusinessStateHash,
    occurredAt
  );

  // Generate business state hash for EscrowAwaitFunds event
  // This event represents the state transition to AWAIT_FUNDS
  const escrowAwaitFundsBusinessState = JSON.stringify({
    status: 'AWAIT_FUNDS',
    rail,
  });
  const escrowAwaitFundsBusinessStateHash = createHash('sha256')
    .update(escrowAwaitFundsBusinessState)
    .digest('hex');

  const escrowAwaitFundsEventId = generateEventId(
    command.escrowId,
    'EscrowAwaitFunds',
    escrowAwaitFundsBusinessStateHash,
    occurredAt
  );

  // Create escrow and emit events in transaction
  await prisma.$transaction(async tx => {
    const txOutboxRepository = outboxRepository.withTransaction(tx);

    // Create escrow record with specific ID (pre-generated by API Gateway)
    const escrow = await tx.escrow.create({
      data: {
        id: command.escrowId,
        rail,
        amount: BigInt(command.amountCents),
        currency: command.currency as Currency,
        status: 'AWAIT_FUNDS',
        offerId: contract.offer.id,
        contractId: command.contractId,
        version: 1,
      },
    });

    // Create EscrowCreated event (protobuf message)
    const escrowCreatedEvent = create(EscrowCreatedSchema, {
      escrowId: escrow.id,
      contractId: command.contractId,
      buyerId: command.buyerId,
      sellerId: command.sellerId,
      currency: command.currency,
      amountCents: command.amountCents,
      network: command.network,
      eventId: escrowCreatedEventId,
      occurredAt,
      version: command.version || 'v1',
    });

    // Create EscrowEvent record for audit trail and idempotency (atomic)
    await createEscrowEventIdempotent(tx, {
      escrowId: escrow.id,
      eventType: 'EscrowCreated',
      payload: {
        eventId: escrowCreatedEventId,
        contractId: command.contractId,
        buyerId: command.buyerId,
        sellerId: command.sellerId,
        currency: command.currency,
        amountCents: command.amountCents.toString(),
        network: command.network,
        rail,
        occurredAt,
      },
      version: 1,
    });

    // Create Outbox record for Kafka publishing
    await txOutboxRepository.create({
      aggregateId: escrow.id,
      eventType: 'EscrowCreated',
      payload: Buffer.from(toBinary(EscrowCreatedSchema, escrowCreatedEvent)),
      version: 1,
    });

    // Create EscrowAwaitFunds event (protobuf message)
    const escrowAwaitFundsEvent = create(EscrowAwaitFundsSchema, {
      escrowId: escrow.id,
      eventId: escrowAwaitFundsEventId,
      occurredAt,
      version: command.version || 'v1',
    });

    // Create EscrowEvent record for audit trail and idempotency (atomic)
    await createEscrowEventIdempotent(tx, {
      escrowId: escrow.id,
      eventType: 'EscrowAwaitFunds',
      payload: {
        eventId: escrowAwaitFundsEventId,
        status: 'AWAIT_FUNDS',
        rail,
        occurredAt,
      },
      version: 1,
    });

    // Create Outbox record for Kafka publishing
    await txOutboxRepository.create({
      aggregateId: escrow.id,
      eventType: 'EscrowAwaitFunds',
      payload: Buffer.from(
        toBinary(EscrowAwaitFundsSchema, escrowAwaitFundsEvent)
      ),
      version: 1,
    });
  });

  // Emit CreatePaymentIntent command after transaction commits
  const provider = rail === 'STRIPE' ? 'stripe' : 'custodian';
  const createPaymentIntentCommand = create(CreatePaymentIntentSchema, {
    escrowId: command.escrowId,
    provider,
    currency: command.currency,
    amountCents: command.amountCents,
    network: command.network,
    traceId: command.traceId,
    causationId: escrowCreatedEventId, // Use EscrowCreated event ID as causation
    correlationId: command.correlationId,
    version: command.version || 'v1',
  });

  await producer.send('payments.commands.v1', {
    key: command.escrowId,
    value: Buffer.from(
      toBinary(CreatePaymentIntentSchema, createPaymentIntentCommand)
    ),
    headers: {
      'content-type': 'application/protobuf',
      'trace-id': command.traceId,
      'correlation-id': command.correlationId,
    },
  });
}

/**
 * Validates CreateEscrow command
 *
 * @param command - CreateEscrow command to validate
 * @throws CreateEscrowValidationError if validation fails
 */
function validateCommand(command: CreateEscrow): void {
  if (!command.escrowId || command.escrowId.trim() === '') {
    throw new CreateEscrowValidationError('escrow_id is required');
  }

  if (!command.contractId || command.contractId.trim() === '') {
    throw new CreateEscrowValidationError('contract_id is required');
  }

  if (!command.buyerId || command.buyerId.trim() === '') {
    throw new CreateEscrowValidationError('buyer_id is required');
  }

  if (!command.sellerId || command.sellerId.trim() === '') {
    throw new CreateEscrowValidationError('seller_id is required');
  }

  if (!command.currency || command.currency.trim() === '') {
    throw new CreateEscrowValidationError('currency is required');
  }

  if (command.currency !== 'USD' && command.currency !== 'USDC') {
    throw new CreateEscrowValidationError(
      `currency must be "USD" or "USDC", got: ${command.currency}`
    );
  }

  if (!command.amountCents || command.amountCents <= 0n) {
    throw new CreateEscrowValidationError(
      `amount_cents must be greater than 0, got: ${command.amountCents}`
    );
  }

  if (!command.eventId || command.eventId.trim() === '') {
    throw new CreateEscrowValidationError('event_id is required');
  }
}
