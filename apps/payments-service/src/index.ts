// Escrow Service Entry Point
import { prisma } from '@bloxtr8/database';
import {
  KafkaConsumer,
  KafkaProducer,
  createConfig,
} from '@bloxtr8/kafka-client';
import { createOutboxPublisher } from '@bloxtr8/outbox-publisher';
import { validateEnvironment } from '@bloxtr8/shared';
import { getTraceContext } from '@bloxtr8/tracing';
import { config } from '@dotenvx/dotenvx';

import * as stripe from './lib/stripe.js';
// Load environment variables
config();

// Validate environment variables
validateEnvironment(['DATABASE_URL','BLOXTR8_FEE_STRIPE', 'KAFKA_BROKERS','STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET']);


const kafkaConfig = createConfig();

// Create Kafka consumer for commands
const consumer = new KafkaConsumer(kafkaConfig, {
  groupId: 'payments-service',
  topics: ['payments.commands.v1'],
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
    PaymentIntentCreated: 'payments.events.v1',
    PaymentSucceeded: 'payments.events.v1',
    PaymentFailed: 'payments.events.v1',
    TransferSucceeded: 'payments.events.v1',
    TransferFailed: 'payments.events.v1',
    RefundSucceeded: 'payments.events.v1',
    RefundFailed: 'payments.events.v1',
  },
});

// Command handler
async function processMessage(message: {
  value: { toString: () => string };
}): Promise<void> {
  try {
    // Trace context is automatically available from AsyncLocalStorage
    const context = getTraceContext();

    // Parse command from message
    const command = JSON.parse(message.value.toString());

    console.log('Processing command', {
      traceId: context?.traceId,
      spanId: context?.spanId,
      commandType: command.commandType,
    });

    // TODO: Implement command routing
    switch (command.commandType) {
      case 'CREATE_PAYMENT_INTENT':
        await stripe.handleCreatePaymentIntent(command);
        break;
      case 'TRANSFER_TO_SELLER':
        await stripe.handleTransferToSeller(command);
        break;
      case 'INITIATE_REFUND':
        await stripe.handleInitiateRefund(command);
        break;
      case 'CANCEL_PAYMENT':
        await stripe.handleCancelPayment(command);
        break;
      default:
        console.error('Unknown command type', command.commandType);
        break;
    }   
  } catch (error) {
    const context = getTraceContext();
    console.error('Error processing message', {
      traceId: context?.traceId,
      spanId: context?.spanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // Will be sent to DLQ automatically if dlqEnabled: true
  }
}

// Start service
async function start(): Promise<void> {
  console.log('Starting Payments Service...');

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

    console.log('[OK] Payments Service ready');
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