# Observability

Comprehensive observability strategy covering distributed tracing, metrics, logging, and reconciliation for the escrow system.

## Distributed Tracing

### Trace Context Propagation

**Headers**: All HTTP requests and Kafka messages include tracing headers

**Standard Fields**:

- `trace_id`: Unique identifier for entire request flow (UUID)
- `span_id`: Unique identifier for current operation (UUID)
- `parent_span_id`: Parent span identifier (UUID)
- `correlation_id`: Business correlation identifier (UUID)
- `causation_id`: Parent event identifier (UUID)

### Trace Propagation Through Kafka

**Kafka Headers**: Tracing headers included in Kafka message headers

**Headers**:

- `X-Trace-Id`: Trace identifier
- `X-Span-Id`: Span identifier
- `X-Parent-Span-Id`: Parent span identifier
- `X-Correlation-Id`: Correlation identifier

**Implementation**:

```typescript
// Producer
const message = {
  key: escrowId,
  value: protobufPayload,
  headers: {
    'X-Trace-Id': traceId,
    'X-Span-Id': spanId,
    'X-Parent-Span-Id': parentSpanId,
    'X-Correlation-Id': correlationId,
  },
};

// Consumer
const traceId = message.headers['X-Trace-Id'];
const spanId = generateSpanId();
const parentSpanId = message.headers['X-Span-Id'];
```

### Trace Structure

**Service Boundaries**: Each service creates spans for operations

**Span Hierarchy**:

```
Request (API Gateway)
  ├─ Command Publish (Kafka Producer)
  │   └─ Command Processing (Escrow Service)
  │       ├─ Database Write
  │       ├─ Event Publish (Kafka Producer)
  │       └─ Payment Command (Payments Service)
  │           ├─ Stripe API Call
  │           └─ Webhook Processing
```

### Trace Sampling

**Production**: 100% sampling (all traces)
**Development**: 10% sampling (reduce overhead)

**Rationale**: High-value transactions require complete traceability

## Metrics

### Business Metrics

#### Escrow Metrics

| Metric                 | Type      | Description                    |
| ---------------------- | --------- | ------------------------------ |
| `escrow.created`       | Counter   | Escrows created                |
| `escrow.funds_held`    | Counter   | Escrows with funds held        |
| `escrow.delivered`     | Counter   | Escrows marked delivered       |
| `escrow.released`      | Counter   | Escrows released               |
| `escrow.refunded`      | Counter   | Escrows refunded               |
| `escrow.cancelled`     | Counter   | Escrows cancelled              |
| `escrow.disputed`      | Counter   | Escrows disputed               |
| `escrow.active`        | Gauge     | Active escrows (current count) |
| `escrow.value.total`   | Histogram | Total escrow value (USD)       |
| `escrow.value.average` | Histogram | Average escrow value           |

#### Payment Metrics

| Metric                       | Type      | Description                   |
| ---------------------------- | --------- | ----------------------------- |
| `payment.intent.created`     | Counter   | Payment intents created       |
| `payment.succeeded`          | Counter   | Successful payments           |
| `payment.failed`             | Counter   | Failed payments               |
| `payment.transfer.succeeded` | Counter   | Successful transfers          |
| `payment.transfer.failed`    | Counter   | Failed transfers              |
| `payment.refund.succeeded`   | Counter   | Successful refunds            |
| `payment.processing.time`    | Histogram | Payment processing time (ms)  |
| `payment.transfer.time`      | Histogram | Transfer processing time (ms) |

#### Latency Metrics

| Metric                           | Type      | Description                            |
| -------------------------------- | --------- | -------------------------------------- |
| `escrow.creation.to.funds_held`  | Histogram | Time from creation to funds held (ms)  |
| `escrow.funds_held.to.delivered` | Histogram | Time from funds held to delivered (ms) |
| `escrow.delivered.to.released`   | Histogram | Time from delivered to released (ms)   |
| `escrow.total.lifetime`          | Histogram | Total escrow lifetime (ms)             |

### System Metrics

#### Kafka Metrics

| Metric                   | Type      | Description             |
| ------------------------ | --------- | ----------------------- |
| `kafka.producer.latency` | Histogram | Producer latency (ms)   |
| `kafka.consumer.lag`     | Gauge     | Consumer lag (messages) |
| `kafka.message.size`     | Histogram | Message size (bytes)    |
| `kafka.error.rate`       | Counter   | Kafka errors per second |

#### Database Metrics

| Metric                      | Type      | Description                |
| --------------------------- | --------- | -------------------------- |
| `db.query.duration`         | Histogram | Query duration (ms)        |
| `db.connection.pool.size`   | Gauge     | Connection pool size       |
| `db.connection.pool.active` | Gauge     | Active connections         |
| `db.error.rate`             | Counter   | Database errors per second |

#### Service Metrics

| Metric                     | Type      | Description           |
| -------------------------- | --------- | --------------------- |
| `service.request.rate`     | Counter   | Requests per second   |
| `service.request.duration` | Histogram | Request duration (ms) |
| `service.error.rate`       | Counter   | Errors per second     |
| `service.memory.usage`     | Gauge     | Memory usage (bytes)  |
| `service.cpu.usage`        | Gauge     | CPU usage (%)         |

### Metric Labels

**Standard Labels**:

- `service`: Service name (escrow-service, payments-service, etc.)
- `environment`: Environment (production, staging, development)
- `rail`: Payment rail (stripe, usdc_base)
- `error_type`: Error classification (transient, permanent)

**Example**:

```
escrow.funds_held{service="escrow-service",rail="stripe",environment="production"}
```

## Logging

### Log Levels

**ERROR**: System errors, failed operations, exceptions
**WARN**: Recoverable errors, retries, degraded performance
**INFO**: Business events, state transitions, important operations
**DEBUG**: Detailed execution flow, variable values (development only)

### Structured Logging

**Format**: JSON

**Standard Fields**:

- `timestamp`: ISO 8601 timestamp
- `level`: Log level (ERROR, WARN, INFO, DEBUG)
- `service`: Service name
- `trace_id`: Distributed trace ID
- `span_id`: Current span ID
- `correlation_id`: Business correlation ID
- `message`: Human-readable message
- `error`: Error object (if error)
- `metadata`: Additional context (key-value pairs)

**Example**:

```json
{
  "timestamp": "2024-01-15T10:30:45.123Z",
  "level": "INFO",
  "service": "escrow-service",
  "trace_id": "550e8400-e29b-41d4-a716-446655440000",
  "span_id": "660e8400-e29b-41d4-a716-446655440001",
  "correlation_id": "req_123456",
  "message": "Escrow state transition",
  "metadata": {
    "escrow_id": "esc_abc123",
    "from_state": "AWAIT_FUNDS",
    "to_state": "FUNDS_HELD",
    "event_id": "evt_xyz789"
  }
}
```

### Log Categories

#### Business Events

**Escrow State Transitions**:

- Escrow created
- Escrow funds held
- Escrow delivered
- Escrow released
- Escrow refunded
- Escrow cancelled

**Payment Events**:

- Payment intent created
- Payment succeeded
- Payment failed
- Transfer succeeded
- Transfer failed
- Refund succeeded

#### System Events

**Kafka Events**:

- Message published
- Message consumed
- Consumer lag
- Partition rebalancing

**Database Events**:

- Query executed
- Transaction committed
- Connection pool exhausted

**External API Events**:

- Stripe API call
- Custodian API call
- TRM Labs API call
- Chainalysis API call

### Log Retention

**Production**: 30 days
**Development**: 7 days

**Archival**: Compress and archive logs older than 30 days (optional)

### Sensitive Data Handling

**Never Log**:

- Payment card numbers (PAN)
- Bank account numbers
- Wallet private keys
- API keys or secrets
- Full user email addresses (use hash)

**Safe to Log**:

- User IDs (non-sensitive)
- Escrow IDs
- Transaction IDs (provider)
- Amounts (sanitized)
- Event IDs
- Trace IDs

## Reconciliation

### Purpose

Ensure consistency between:

- Escrow state (database)
- Payment provider state (Stripe/Custodian)
- Kafka event stream

### Reconciliation Jobs

#### Daily Reconciliation

**Schedule**: Runs daily at 2 AM UTC

**Process**:

1. Query all escrows in `FUNDS_HELD` or `DELIVERED` state
2. For each escrow:
   - Query Stripe/Custodian for payment status
   - Compare with database state
   - Detect discrepancies
3. Emit reconciliation events for discrepancies

**Discrepancies Detected**:

- Escrow `FUNDS_HELD` but payment not confirmed (provider)
- Escrow `RELEASED` but transfer not confirmed (provider)
- Payment confirmed (provider) but escrow still `AWAIT_FUNDS`

#### Hourly Reconciliation

**Schedule**: Runs every hour

**Process**:

1. Query escrows in `AWAIT_FUNDS` > 24 hours
2. Verify payment intent status with provider
3. If payment succeeded but escrow not updated: Emit `PaymentSucceeded` event

**Purpose**: Catch missed webhooks

### Reconciliation Events

**Event**: `ReconciliationDiscrepancyFound`

```protobuf
message ReconciliationDiscrepancyFound {
  string escrow_id = 1;
  string discrepancy_type = 2;       // "PAYMENT_MISMATCH" | "STATE_MISMATCH" | "TRANSFER_MISMATCH"
  string expected_state = 3;
  string actual_state = 4;
  string provider_state = 5;
  string event_id = 6;
  string occurred_at = 7;
  string version = 8;
}
```

**Handling**: Alert operations team, manual investigation required

### Reconciliation Metrics

| Metric                             | Type      | Description                  |
| ---------------------------------- | --------- | ---------------------------- |
| `reconciliation.run.count`         | Counter   | Reconciliation runs          |
| `reconciliation.discrepancy.count` | Counter   | Discrepancies found          |
| `reconciliation.duration`          | Histogram | Reconciliation duration (ms) |

## Alert Definitions

### Critical Alerts

| Alert                      | Condition                    | Action                                    |
| -------------------------- | ---------------------------- | ----------------------------------------- |
| DLQ Message Count > 100    | DLQ has > 100 messages       | Pager alert, investigate immediately      |
| Error Rate > 5%            | Error rate > 5% of requests  | Pager alert, investigate immediately      |
| Consumer Lag > 5000        | Consumer lag > 5000 messages | Pager alert, scale consumers              |
| Reconciliation Discrepancy | Discrepancy found            | Pager alert, investigate immediately      |
| Payment Processing Failure | Payment failure rate > 1%    | Pager alert, investigate payment provider |

### Warning Alerts

| Alert                 | Condition                          | Action                            |
| --------------------- | ---------------------------------- | --------------------------------- |
| DLQ Message Count > 0 | DLQ has messages                   | Investigate during business hours |
| Error Rate > 1%       | Error rate > 1% of requests        | Investigate during business hours |
| Consumer Lag > 1000   | Consumer lag > 1000 messages       | Monitor, consider scaling         |
| Escrow Stuck > 24h    | Escrow in non-terminal state > 24h | Review stuck escrows              |

### Alert Channels

**Pager Alerts**: PagerDuty, Opsgenie
**Warning Alerts**: Slack, Email
**Reconciliation Alerts**: Slack channel dedicated to reconciliation

## Dashboards

### Executive Dashboard

**Metrics**:

- Total escrow value (USD)
- Active escrows count
- Escrows completed today
- Escrows released today
- Average escrow lifetime

**Purpose**: Business overview

### Operations Dashboard

**Metrics**:

- Error rate by service
- Consumer lag by topic
- DLQ message count
- Reconciliation discrepancies
- Payment success rate

**Purpose**: System health monitoring

### Service Dashboard

**Metrics**:

- Request rate and latency
- Error rate
- Database query performance
- Kafka producer/consumer metrics

**Purpose**: Service-level monitoring

## Related Documentation

- [Error Handling](./error-handling-retries.md) - Error recovery strategies
- [Escrow System Architecture](./escrow-system-architecture.md) - Architecture overview
- [Security & Compliance](./security-compliance.md) - Security requirements
