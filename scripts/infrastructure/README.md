# Infrastructure Scripts

This directory contains scripts for setting up and managing Kafka infrastructure for the Bloxtr8 escrow system.

## Scripts

### `create-kafka-topics.sh`

Creates all Kafka topics and Dead Letter Queue (DLQ) topics required for the escrow system.

**Usage**:

```bash
# Create all topics for development
./scripts/infrastructure/create-kafka-topics.sh --env development

# Create all topics for production
./scripts/infrastructure/create-kafka-topics.sh --env production --broker kafka-broker-1:9093

# Create specific topic
./scripts/infrastructure/create-kafka-topics.sh --topic escrow.commands.v1

# Dry run (show what would be created)
./scripts/infrastructure/create-kafka-topics.sh --dry-run
```

**Options**:

- `--env`: Environment (development|production) [default: development]
- `--broker`: Kafka broker address [default: localhost:9092]
- `--topic`: Create specific topic only
- `--dry-run`: Show what would be created without creating
- `--help`: Show help message

**Topics Created**:

- `escrow.commands.v1` (12 partitions, 7 days retention)
- `escrow.events.v1` (12 partitions, 90 days retention, compaction enabled)
- `payments.commands.v1` (12 partitions, 7 days retention)
- `payments.events.v1` (12 partitions, 90 days retention, compaction enabled)
- `webhook.events.v1` (12 partitions, 90 days retention, compaction enabled)
- `contracts.events.v1` (12 partitions, 90 days retention, compaction enabled)
- All corresponding DLQ topics (`*.dlq`)

### `setup-schema-registry.sh`

Initializes Schema Registry and registers Protobuf schemas for the escrow system.

**Usage**:

```bash
# Setup for development
./scripts/infrastructure/setup-schema-registry.sh --env development

# Setup for production
./scripts/infrastructure/setup-schema-registry.sh \
  --env production \
  --schema-registry-url http://schema-registry:8081

# Dry run
./scripts/infrastructure/setup-schema-registry.sh --dry-run
```

**Options**:

- `--env`: Environment (development|production) [default: development]
- `--schema-registry-url`: Schema Registry URL [default: http://localhost:8081]
- `--schema-dir`: Directory containing Protobuf schema files [default: scripts/schemas/protobuf]
- `--dry-run`: Show what would be registered without registering
- `--help`: Show help message

**Schemas Registered**:

- `escrow.commands.v1-value`
- `escrow.events.v1-value`
- `payments.commands.v1-value`
- `payments.events.v1-value`
- `webhook.events.v1-value`
- `contracts.events.v1-value`

## Configuration Files

### `prometheus-config.yml`

Prometheus scrape configuration for monitoring Kafka, Schema Registry, and application services.

**Usage**:

```bash
# Start Prometheus with this configuration
prometheus --config.file=scripts/infrastructure/prometheus-config.yml
```

### `alerts.yml`

Prometheus alert rules for Kafka infrastructure, consumer lag, DLQ, Schema Registry, and application services.

**Usage**:

```bash
# Reference this file in prometheus-config.yml
rule_files:
  - '/path/to/scripts/infrastructure/alerts.yml'
```

## Grafana Dashboards

Pre-configured Grafana dashboards for monitoring:

- **kafka-overview.json**: Kafka cluster overview (broker status, message rate, consumer lag, DLQ size)
- **schema-registry.json**: Schema Registry metrics (status, schema versions, compatibility checks)
- **application-metrics.json**: Application service metrics (request rate, latency, business metrics)

**Import to Grafana**:

1. Open Grafana UI
2. Go to Dashboards → Import
3. Upload JSON file or paste content
4. Configure data source (Prometheus)

## Prerequisites

### Required Tools

- `kafka-topics`: Kafka command-line tool (included with Kafka distribution)
- `curl`: HTTP client for Schema Registry API
- `jq`: JSON processor (optional, for better output formatting)
- `base64`: Base64 encoding (usually pre-installed)

### Environment Setup

**Development**:

- Kafka running on `localhost:9092`
- Schema Registry running on `http://localhost:8081`

**Production**:

- Kafka brokers accessible via configured addresses
- Schema Registry accessible via configured URL
- Proper authentication configured (SASL/SCRAM, TLS)

## Troubleshooting

### Kafka Connectivity Issues

```bash
# Test Kafka connectivity
kafka-topics --bootstrap-server localhost:9092 --list

# Check broker status
kafka-broker-api-versions --bootstrap-server localhost:9092
```

### Schema Registry Connectivity Issues

```bash
# Test Schema Registry connectivity
curl http://localhost:8081/subjects

# Check Schema Registry health
curl http://localhost:8081/health
```

### Topic Creation Failures

- Verify Kafka broker is running and accessible
- Check broker configuration (replication factor, partitions)
- Verify user has permissions to create topics
- Check broker logs for errors

### Schema Registration Failures

- Verify Schema Registry is running and accessible
- Check Protobuf schema files exist and are valid
- Verify schema compatibility mode settings
- Check Schema Registry logs for errors

## Related Documentation

- [Infrastructure Design Document](../../documentation/design/escrow/infrastructure-design.md)
- [Topic Catalog](../../documentation/architecture/escrow/topic-catalog.md)
- [Event Schemas](../../documentation/architecture/escrow/event-schemas.md)
