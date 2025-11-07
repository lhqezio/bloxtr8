# Kafka Topic Catalog

Complete inventory of Kafka topics used in the escrow system, including partitioning strategies, retention policies, and producer/consumer mappings.

## Topic Naming Convention

Format: `{domain}.{type}.v{version}`

- **Domain**: `escrow`, `payments`, `webhook`, `contracts`
- **Type**: `commands` (request-response), `events` (domain events)
- **Version**: `v1`, `v2`, etc. (schema version)

## Topics Overview

| Topic                  | Type    | Key                   | Partitions | Retention | Compaction |
| ---------------------- | ------- | --------------------- | ---------- | --------- | ---------- |
| `escrow.commands.v1`   | Command | `escrow_id`           | 12         | 7 days    | No         |
| `escrow.events.v1`     | Event   | `escrow_id`           | 12         | 90 days   | Yes        |
| `payments.commands.v1` | Command | `escrow_id`           | 12         | 7 days    | No         |
| `payments.events.v1`   | Event   | `escrow_id`           | 12         | 90 days   | Yes        |
| `webhook.events.v1`    | Event   | `provider_payment_id` | 12         | 90 days   | Yes        |
| `contracts.events.v1`  | Event   | `contract_id`         | 12         | 90 days   | Yes        |

## Escrow Topics

### escrow.commands.v1

**Purpose**: Commands for escrow state transitions

**Partition Key**: `escrow_id`

**Message Types**:

- `CreateEscrow`
- `MarkDelivered`
- `ReleaseFunds`
- `CancelEscrow`
- `RaiseDispute`
- `ResolveDispute`

**Producers**:

- API Gateway

**Consumers**:

- Escrow Service (single consumer group)

**Retention**: 7 days
**Compaction**: Disabled (commands are consumed and not replayed)

**DLQ**: `escrow.commands.v1.dlq`

### escrow.events.v1

**Purpose**: Domain events emitted by Escrow Service

**Partition Key**: `escrow_id`

**Message Types**:

- `EscrowCreated`
- `EscrowAwaitFunds`
- `EscrowFundsHeld`
- `EscrowDelivered`
- `EscrowReleased`
- `EscrowCancelled`
- `EscrowDisputed`
- `EscrowRefunded`

**Producers**:

- Escrow Service (via outbox pattern)

**Consumers**:

- Projections Service
- Notifications Service
- Payments Service (for refund coordination)

**Retention**: 90 days
**Compaction**: Enabled (key-based deduplication)

**DLQ**: `escrow.events.v1.dlq`

## Payment Topics

### payments.commands.v1

**Purpose**: Commands for payment operations

**Partition Key**: `escrow_id`

**Message Types**:

- `CreatePaymentIntent`
- `TransferToSeller`
- `InitiateRefund`
- `CancelPayment`

**Producers**:

- Escrow Service (payment initiation)
- API Gateway (refund requests)

**Consumers**:

- Payments Service (single consumer group)

**Retention**: 7 days
**Compaction**: Disabled

**DLQ**: `payments.commands.v1.dlq`

### payments.events.v1

**Purpose**: Payment domain events

**Partition Key**: `escrow_id`

**Message Types**:

- `PaymentIntentCreated`
- `PaymentSucceeded`
- `PaymentFailed`
- `TransferSucceeded`
- `TransferFailed`
- `RefundSucceeded`
- `RefundFailed`

**Producers**:

- Payments Service (via outbox pattern)

**Consumers**:

- Escrow Service (state transitions)
- Projections Service
- Notifications Service

**Retention**: 90 days
**Compaction**: Enabled

**DLQ**: `payments.events.v1.dlq`

## Webhook Topics

### webhook.events.v1

**Purpose**: Validated webhook events from external providers

**Partition Key**: `provider_payment_id` (Stripe payment_intent ID or custodian transaction hash)

**Message Types**:

- `StripeWebhookValidated`
- `CustodianWebhookValidated`

**Producers**:

- Payments Service (after webhook signature verification)

**Consumers**:

- Payments Service (payment processing)
- Escrow Service (indirect via payment events)

**Retention**: 90 days
**Compaction**: Enabled (deduplicate by provider ID)

**DLQ**: `webhook.events.v1.dlq`

**Note**: Raw webhooks arrive via HTTP, are validated, then emitted as events. This topic contains only validated webhooks.

## Contract Topics

### contracts.events.v1

**Purpose**: Contract lifecycle events

**Partition Key**: `contract_id`

**Message Types**:

- `ContractExecuted`
- `ContractVoided`

**Producers**:

- Contract Service (or API Gateway if contracts handled in API)

**Consumers**:

- Escrow Service (triggers escrow creation)

**Retention**: 90 days
**Compaction**: Enabled

**DLQ**: `contracts.events.v1.dlq`

## Dead Letter Queues (DLQ)

All topics have corresponding DLQ topics for poison messages.

**Naming**: `{topic}.dlq`

**Retention**: 30 days
**Compaction**: Disabled

**Monitoring**: Alert on DLQ message count > 0

**Recovery**: Manual review and replay via admin tool

## Schema Versioning

### Versioning Strategy

- **Backward Compatible Changes**: Same version (add optional fields, remove fields)
- **Breaking Changes**: New version (e.g., `escrow.events.v2`)

### Migration Process

1. Deploy new schema version alongside old version
2. Producers emit both versions during transition period
3. Consumers upgraded to handle both versions
4. Deprecate old version after all consumers upgraded
5. Remove old version topic after retention period

### Schema Registry

- **Format**: Protobuf
- **Registry**: Confluent Schema Registry
- **Compatibility**: BACKWARD (new consumers can read old events)
- **Validation**: On producer publish

## Partitioning Rationale

### escrow_id Partitioning

**Topics**: `escrow.commands.v1`, `escrow.events.v1`, `payments.commands.v1`, `payments.events.v1`

**Rationale**:

- All events for a single escrow processed in order
- Enables idempotent processing (deduplicate by event ID within escrow)
- Maintains causal ordering (FUNDS_HELD always before DELIVERED)
- Scales by escrow volume (more escrows = more parallelism)

### provider_payment_id Partitioning

**Topics**: `webhook.events.v1`

**Rationale**:

- Webhooks for same payment processed in order
- Deduplication by provider payment ID
- Isolates payment provider failures

### contract_id Partitioning

**Topics**: `contracts.events.v1`

**Rationale**:

- Contract events processed in order
- Enables contract-level event replay

## Producer/Consumer Mappings

### Producer Overview

| Service          | Topics Produced                              | Pattern         |
| ---------------- | -------------------------------------------- | --------------- |
| API Gateway      | `escrow.commands.v1`, `payments.commands.v1` | Direct producer |
| Escrow Service   | `escrow.events.v1`                           | Outbox pattern  |
| Payments Service | `payments.events.v1`, `webhook.events.v1`    | Outbox pattern  |
| Contract Service | `contracts.events.v1`                        | Direct producer |

### Consumer Overview

| Service               | Topics Consumed                             | Consumer Group          | Concurrency     |
| --------------------- | ------------------------------------------- | ----------------------- | --------------- |
| Escrow Service        | `escrow.commands.v1`, `payments.events.v1`  | `escrow-service`        | 1 per partition |
| Payments Service      | `payments.commands.v1`, `webhook.events.v1` | `payments-service`      | 1 per partition |
| Projections Service   | `escrow.events.v1`, `payments.events.v1`    | `projections-service`   | 1 per partition |
| Notifications Service | `escrow.events.v1`, `payments.events.v1`    | `notifications-service` | 1 per partition |

## Replication & Availability

### Replication Factor

**Production**: 3 (replicas across availability zones)
**Development**: 1 (single broker)

### Minimum In-Sync Replicas (ISR)

**Production**: 2 (allows 1 broker failure)
**Development**: 1

### Acknowledgment

**Producer**: `acks=all` (wait for all ISR replicas)
**Consumer**: Manual commit after processing

## Performance Targets

### Throughput

- **Commands**: 1,000 messages/second per topic
- **Events**: 5,000 messages/second per topic

### Latency

- **Producer Latency**: < 10ms (p95)
- **Consumer Lag**: < 100ms (p95)

### Message Size

- **Average**: < 1KB per message
- **Maximum**: < 10KB per message (Protobuf compression)

## Monitoring

### Key Metrics

- **Message Rate**: Messages/second per topic
- **Consumer Lag**: Lag per partition
- **DLQ Size**: Messages in DLQ topics
- **Processing Time**: Time to process message (p50, p95, p99)

### Alerts

- **Consumer Lag > 1000**: Consumer falling behind
- **DLQ Size > 0**: Poison messages detected
- **Topic Unavailable**: Partition leader unavailable
- **ISR < 2**: Insufficient replicas for production

## Topic Configuration

### Automated Provisioning

Use the helper script at `scripts/kafka/setup-topics.sh` to provision all topics and DLQs with the correct retention and replication settings.

```bash
# Development (single-replica)
scripts/kafka/setup-topics.sh --env development --bootstrap-servers localhost:9092

# Production (3 replicas)
scripts/kafka/setup-topics.sh --env production --bootstrap-servers broker-1:9092,broker-2:9092,broker-3:9092
```

The legacy wrapper `scripts/infrastructure/create-kafka-topics.sh` forwards to the same script for compatibility with existing automation.

### Example Topic Creation

```bash
# Create escrow.commands.v1
kafka-topics --create \
  --topic escrow.commands.v1 \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config min.insync.replicas=2 \
  --config compression.type=snappy
```

### Configuration Parameters

- **retention.ms**: Message retention period
- **min.insync.replicas**: Minimum ISR for writes
- **compression.type**: `snappy` (good balance of speed/size)
- **cleanup.policy**: `delete` (commands) or `compact` (events)

## Related Documentation

- [Event Schemas](./event-schemas.md) - Detailed Protobuf schemas
- [Escrow System Architecture](./escrow-system-architecture.md) - Architecture overview
- [Error Handling](./error-handling-retries.md) - DLQ and retry strategies
