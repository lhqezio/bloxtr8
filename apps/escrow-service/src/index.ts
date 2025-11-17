// Escrow Service Entry Point
import { PrismaClient } from '@bloxtr8/database';
import {
  KafkaConsumer,
  KafkaProducer,
  createConfig,
  type ConsumerMessage,
} from '@bloxtr8/kafka-client';
import { createOutboxPublisher } from '@bloxtr8/outbox-publisher';
import {
  CreateEscrowSchema,
  MarkDeliveredSchema,
  ReleaseFundsSchema,
  CancelEscrowSchema,
  RaiseDisputeSchema,
  ResolveDisputeSchema,
  type CreateEscrow,
  type MarkDelivered,
  type ReleaseFunds,
  type CancelEscrow,
  type RaiseDispute,
  type ResolveDispute,
} from '@bloxtr8/protobuf-schemas';
import { validateEnvironment } from '@bloxtr8/shared';
import { getTraceContext } from '@bloxtr8/tracing';
import { fromBinary } from '@bufbuild/protobuf';
import { config } from '@dotenvx/dotenvx';

import { handleCreateEscrow } from './handlers/create-escrow.js';

// Load environment variables
config();

// Validate environment variables
validateEnvironment(['DATABASE_URL', 'KAFKA_BROKERS']);

const prisma = new PrismaClient();
const kafkaConfig = createConfig();

// Create Kafka consumer for commands
const consumer = new KafkaConsumer(kafkaConfig, {
  groupId: 'escrow-service',
  topics: ['escrow.commands.v1'],
  dlqEnabled: true,
  fromBeginning: false,
});

// Create Kafka producer for commands (direct publishing)
const producer = new KafkaProducer(kafkaConfig);

// Create outbox publisher for events
const outboxPublisher = createOutboxPublisher(kafkaConfig, {
  pollIntervalMs: 1000,
  batchSize: 100,
  topicMapping: {
    EscrowCreated: 'escrow.events.v1',
    EscrowAwaitFunds: 'escrow.events.v1',
    EscrowFundsHeld: 'escrow.events.v1',
    EscrowDelivered: 'escrow.events.v1',
    DeliveryConfirmed: 'escrow.events.v1',
    EscrowReleased: 'escrow.events.v1',
    EscrowRefunded: 'escrow.events.v1',
    DisputeOpened: 'escrow.events.v1',
    DisputeResolved: 'escrow.events.v1',
    EscrowCancelled: 'escrow.events.v1',
    EscrowExpired: 'escrow.events.v1',
  },
});

// Command handler
async function processMessage(message: ConsumerMessage): Promise<void> {
  try {
    // Trace context is automatically available from AsyncLocalStorage
    const context = getTraceContext();

    console.log('Processing command', {
      traceId: context?.traceId,
      spanId: context?.spanId,
      topic: message.topic,
      partition: message.partition,
      offset: message.offset,
    });

    // Determine command type from topic and deserialize accordingly
    // For escrow.commands.v1 topic, we need to determine the command type
    // by attempting to deserialize with each schema or by checking headers
    const contentType = message.headers['content-type']?.toString();

    if (contentType === 'application/protobuf' || !contentType) {
      // Try to deserialize as CreateEscrow first (most common command)
      try {
        const command = message.deserialize({
          fromBinary: (bytes: Uint8Array) =>
            fromBinary(CreateEscrowSchema, bytes) as CreateEscrow,
        });
        await handleCreateEscrow(command, prisma, producer);
        return;
      } catch {
        // Not a CreateEscrow command, try other command types
        // For now, we'll handle CreateEscrow. Other handlers can be added similarly
        console.warn(
          'Failed to deserialize as CreateEscrow, trying other command types...'
        );
      }

      // Try other command types
      try {
        const command = message.deserialize({
          fromBinary: (bytes: Uint8Array) =>
            fromBinary(MarkDeliveredSchema, bytes) as MarkDelivered,
        });
        console.log('MarkDelivered command handler not implemented', {
          escrowId: command.escrowId,
        });
        return;
      } catch {
        // Not MarkDelivered
      }

      try {
        const command = message.deserialize({
          fromBinary: (bytes: Uint8Array) =>
            fromBinary(ReleaseFundsSchema, bytes) as ReleaseFunds,
        });
        console.log('ReleaseFunds command handler not implemented', {
          escrowId: command.escrowId,
        });
        return;
      } catch {
        // Not ReleaseFunds
      }

      try {
        const command = message.deserialize({
          fromBinary: (bytes: Uint8Array) =>
            fromBinary(CancelEscrowSchema, bytes) as CancelEscrow,
        });
        console.log('CancelEscrow command handler not implemented', {
          escrowId: command.escrowId,
        });
        return;
      } catch {
        // Not CancelEscrow
      }

      try {
        const command = message.deserialize({
          fromBinary: (bytes: Uint8Array) =>
            fromBinary(RaiseDisputeSchema, bytes) as RaiseDispute,
        });
        console.log('RaiseDispute command handler not implemented', {
          escrowId: command.escrowId,
        });
        return;
      } catch {
        // Not RaiseDispute
      }

      try {
        const command = message.deserialize({
          fromBinary: (bytes: Uint8Array) =>
            fromBinary(ResolveDisputeSchema, bytes) as ResolveDispute,
        });
        console.log('ResolveDispute command handler not implemented', {
          escrowId: command.escrowId,
        });
        return;
      } catch {
        // Not ResolveDispute
      }

      console.warn('Unknown command type - could not deserialize message');
    } else {
      // Fallback to JSON parsing for backward compatibility
      try {
        const command = JSON.parse(message.value.toString());
        console.log('Received JSON command (legacy format)', {
          commandType: command.commandType,
        });
        // Handle legacy JSON format if needed
      } catch (jsonError) {
        throw new Error(
          `Failed to parse message: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`
        );
      }
    }
  } catch (error) {
    const context = getTraceContext();
    console.error('Error processing message', {
      traceId: context?.traceId,
      spanId: context?.spanId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error; // Will be sent to DLQ automatically if dlqEnabled: true
  }
}

// Start service
async function start(): Promise<void> {
  console.log('Starting Escrow Service...');

  try {
    // Connect to database
    await prisma.$connect();
    console.log('[OK] Database connected');

    // Start Kafka consumer
    await consumer.run(processMessage);
    console.log('[OK] Kafka consumer started');

    // Start outbox publisher
    await outboxPublisher.start();
    console.log('[OK] Outbox publisher started');

    console.log('[OK] Escrow Service ready');
  } catch (error) {
    console.error('Failed to start service:', error);
    throw error;
  }
}

// Graceful shutdown handler
let shutdownInProgress = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (shutdownInProgress) {
    console.log('Shutdown already in progress, forcing exit...');
    process.exit(1);
  }

  shutdownInProgress = true;
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  try {
    // 1. Stop accepting new messages
    console.log('Stopping consumer...');
    await consumer.stop();

    // 2. Stop outbox publisher
    console.log('Stopping outbox publisher...');
    await outboxPublisher.stop();

    // 3. Wait for in-flight operations to complete
    console.log('Waiting for in-flight operations...');
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second grace period

    // 4. Disconnect producers
    console.log('Disconnecting producer...');
    await producer.disconnect();

    // 5. Close database connections
    console.log('Closing database connections...');
    await prisma.$disconnect();

    console.log('[OK] Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('[ERROR] Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on(
  'unhandledRejection',
  (reason: unknown, promise: Promise<unknown>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown('unhandledRejection');
  }
);

// Start the service
start().catch(error => {
  console.error('Failed to start service:', error);
  process.exit(1);
});
