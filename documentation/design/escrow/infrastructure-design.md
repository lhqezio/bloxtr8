# Kafka Infrastructure Design Document

Comprehensive infrastructure design and implementation guide for Apache Kafka, Schema Registry, and related monitoring infrastructure for the Bloxtr8 escrow system.

## Table of Contents

- [Overview](#overview)
- [Kafka Cluster Setup and Configuration](#kafka-cluster-setup-and-configuration)
- [Schema Registry Setup](#schema-registry-setup)
- [Topic Creation Scripts](#topic-creation-scripts)
- [Dead Letter Queue Configuration](#dead-letter-queue-configuration)
- [Monitoring and Alerting Setup](#monitoring-and-alerting-setup)
- [Deployment Procedures](#deployment-procedures)
- [Troubleshooting Guide](#troubleshooting-guide)

## Overview

### Purpose

This document provides complete infrastructure design for deploying and operating Apache Kafka and Schema Registry in support of the Bloxtr8 escrow system's event-driven architecture. The infrastructure enables:

- **Event-Driven Communication**: Asynchronous messaging between microservices
- **Schema Evolution**: Protobuf schema management with backward compatibility
- **High Availability**: Multi-broker clusters with replication
- **Operational Excellence**: Comprehensive monitoring and alerting

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Kafka Cluster                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Broker 1 │  │ Broker 2 │  │ Broker 3 │                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│       │              │              │                       │
│       └──────────────┼──────────────┘                       │
│                      │                                       │
│            ┌─────────▼──────────┐                           │
│            │  Schema Registry   │                           │
│            │  (Confluent)       │                           │
│            └────────────────────┘                           │
└─────────────────────────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
   ┌────▼────┐  ┌────▼────┐  ┌────▼────┐
   │Services │  │Services │  │Services │
   └─────────┘  └─────────┘  └─────────┘
        │             │             │
   ┌────▼─────────────▼─────────────▼────┐
   │     Prometheus + Grafana            │
   │     Monitoring Stack                │
   └──────────────────────────────────────┘
```

### Key Design Decisions

- **Kafka Version**: 3.5+ with KRaft mode (no Zookeeper dependency)
- **Schema Registry**: Confluent Schema Registry 7.5+ supporting Protobuf
- **Monitoring Stack**: Prometheus + Grafana (standard OSS stack)
- **Security**: SASL/SCRAM authentication + TLS encryption
- **Replication**: 3 brokers in production, 1 in development
- **Topic Partitions**: 12 partitions per topic (supports 12 concurrent consumers)

## Kafka Cluster Setup and Configuration

### Cluster Topology

#### Production Environment

**Broker Configuration**:
- **Broker Count**: 3 brokers (minimum for high availability)
- **Deployment**: One broker per availability zone
- **Instance Type**: Minimum 4 vCPU, 16GB RAM, 500GB SSD per broker
- **Network**: VPC with private subnets, security groups for inter-broker communication

**Replication Settings**:
- **Replication Factor**: 3 (each partition replicated across all brokers)
- **Minimum In-Sync Replicas (ISR)**: 2 (allows 1 broker failure)
- **Unclean Leader Election**: Disabled (prevents data loss)

#### Development Environment

**Broker Configuration**:
- **Broker Count**: 1 broker (single-node cluster)
- **Instance Type**: 2 vCPU, 8GB RAM, 100GB SSD
- **Replication Factor**: 1

### Kafka Configuration

#### Broker Configuration (`server.properties`)

**Core Settings**:

```properties
# Broker ID (unique per broker)
broker.id=1

# KRaft Mode Configuration (no Zookeeper)
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@kafka-controller-1:9093,2@kafka-controller-2:9093,3@kafka-controller-3:9093

# Network Listeners
listeners=PLAINTEXT://0.0.0.0:9092,SASL_SSL://0.0.0.0:9093,CONTROLLER://0.0.0.0:9094
advertised.listeners=PLAINTEXT://kafka-broker-1:9092,SASL_SSL://kafka-broker-1:9093
inter.broker.listener.name=SASL_SSL
listener.security.protocol.map=PLAINTEXT:PLAINTEXT,SASL_SSL:SASL_SSL,CONTROLLER:PLAINTEXT

# SASL Configuration
sasl.enabled.mechanisms=SCRAM-SHA-512
sasl.mechanism.inter.broker.protocol=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required \
  username="kafka-broker" \
  password="<secure-password>";

# SSL Configuration
ssl.keystore.location=/var/private/ssl/kafka.server.keystore.jks
ssl.keystore.password=<keystore-password>
ssl.key.password=<key-password>
ssl.truststore.location=/var/private/ssl/kafka.server.truststore.jks
ssl.truststore.password=<truststore-password>
ssl.client.auth=required
ssl.endpoint.identification.algorithm=HTTPS

# Log Configuration
log.dirs=/var/kafka-logs
log.retention.hours=168
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000

# Performance Tuning
num.network.threads=8
num.io.threads=16
socket.send.buffer.bytes=102400
socket.receive.buffer.bytes=102400
socket.request.max.bytes=104857600

# Replication
num.replica.fetchers=4
replica.fetch.max.bytes=1048576
replica.fetch.wait.max.ms=500
replica.high.watermark.checkpoint.interval.ms=5000

# Compaction
log.cleaner.enable=true
log.cleaner.threads=2
log.cleaner.io.max.bytes.per.second=104857600

# Controller Configuration (KRaft)
controller.listener.names=CONTROLLER
controller.quorum.election.timeout.ms=1000
controller.quorum.fetch.timeout.ms=2000
```

#### Development Configuration

**Simplified Configuration**:

```properties
# Broker ID
broker.id=1

# KRaft Mode (single node)
process.roles=broker,controller
node.id=1
controller.quorum.voters=1@localhost:9093

# Network Listeners (no security for development)
listeners=PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9094
advertised.listeners=PLAINTEXT://localhost:9092
inter.broker.listener.name=PLAINTEXT
listener.security.protocol.map=PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT

# Log Configuration
log.dirs=/tmp/kafka-logs
log.retention.hours=168
log.segment.bytes=1073741824

# Performance (reduced for development)
num.network.threads=4
num.io.threads=8
```

### Security Configuration

#### SASL/SCRAM Setup

**Creating SCRAM Users**:

```bash
# Create admin user
kafka-configs --bootstrap-server localhost:9092 \
  --command-config admin.properties \
  --alter --add-config 'SCRAM-SHA-512=[password=admin-secure-password]' \
  --entity-type users --entity-name kafka-admin

# Create broker user
kafka-configs --bootstrap-server localhost:9092 \
  --command-config admin.properties \
  --alter --add-config 'SCRAM-SHA-512=[password=broker-secure-password]' \
  --entity-type users --entity-name kafka-broker

# Create client user
kafka-configs --bootstrap-server localhost:9092 \
  --command-config admin.properties \
  --alter --add-config 'SCRAM-SHA-512=[password=client-secure-password]' \
  --entity-type users --entity-name kafka-client
```

**Client Configuration** (`client.properties`):

```properties
bootstrap.servers=kafka-broker-1:9093,kafka-broker-2:9093,kafka-broker-3:9093
security.protocol=SASL_SSL
sasl.mechanism=SCRAM-SHA-512
sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required \
  username="kafka-client" \
  password="client-secure-password";
ssl.truststore.location=/path/to/truststore.jks
ssl.truststore.password=<truststore-password>
```

#### TLS/SSL Configuration

**Certificate Generation**:

```bash
# Generate CA certificate
openssl req -new -x509 -keyout ca-key -out ca-cert -days 365

# Generate broker keystore
keytool -keystore kafka.server.keystore.jks -alias localhost -validity 365 \
  -genkey -keyalg RSA -storepass <keystore-password> -keypass <key-password>

# Sign broker certificate
keytool -keystore kafka.server.truststore.jks -alias CARoot -import -file ca-cert

# Export certificate signing request
keytool -keystore kafka.server.keystore.jks -alias localhost -certreq -file cert-file

# Sign certificate with CA
openssl x509 -req -CA ca-cert -CAkey ca-key -in cert-file -out cert-signed \
  -days 365 -CAcreateserial

# Import CA and signed certificate
keytool -keystore kafka.server.keystore.jks -alias CARoot -import -file ca-cert
keytool -keystore kafka.server.keystore.jks -alias localhost -import -file cert-signed
```

### High Availability Setup

#### Broker Failure Handling

**Scenario 1: Single Broker Failure**

- **Impact**: Minimal, remaining brokers continue serving requests
- **Recovery**: Automatic failover, ISR elects new leader
- **Downtime**: None (if ISR >= 2)

**Scenario 2: Controller Failure**

- **Impact**: Leader election delays, metadata updates paused
- **Recovery**: Automatic controller re-election (KRaft)
- **Downtime**: < 1 second

**Scenario 3: Network Partition**

- **Impact**: Partition split, only majority partition operates
- **Recovery**: Automatic merge when network heals
- **Prevention**: Deploy brokers across availability zones

#### Backup and Recovery

**Snapshot Creation**:

```bash
# Create metadata snapshot
kafka-metadata-snapshot --bootstrap-server localhost:9092 \
  --snapshot /backup/kafka-metadata-snapshot.json

# Backup log directories
tar -czf kafka-logs-backup-$(date +%Y%m%d).tar.gz /var/kafka-logs
```

**Recovery Procedure**:

```bash
# Restore metadata snapshot
kafka-metadata-snapshot --bootstrap-server localhost:9092 \
  --restore /backup/kafka-metadata-snapshot.json

# Restore log directories
tar -xzf kafka-logs-backup-YYYYMMDD.tar.gz -C /var/kafka-logs
```

### Performance Tuning

#### JVM Settings

**Production JVM Configuration**:

```bash
KAFKA_HEAP_OPTS="-Xmx8G -Xms8G"
KAFKA_JVM_PERFORMANCE_OPTS="-server -XX:+UseG1GC \
  -XX:MaxGCPauseMillis=20 -XX:InitiatingHeapOccupancyPercent=35 \
  -XX:+ExplicitGCInvokesConcurrent -XX:MaxInlineLevel=15 \
  -Djava.awt.headless=true"
```

**Key Tuning Parameters**:

- **Heap Size**: 8GB minimum per broker
- **Garbage Collector**: G1GC for low latency
- **Max GC Pause**: 20ms target
- **GC Threshold**: 35% heap occupancy

#### Broker-Level Tuning

**Critical Parameters**:

```properties
# Increase partition count support
num.partitions=12

# Optimize fetch performance
replica.fetch.max.bytes=1048576
replica.fetch.wait.max.ms=500

# Optimize producer performance
compression.type=snappy
batch.size=16384
linger.ms=10

# Optimize consumer performance
fetch.min.bytes=1
fetch.max.wait.ms=500
max.partition.fetch.bytes=1048576
```

## Schema Registry Setup

### Schema Registry Architecture

#### Standalone Deployment

**Configuration** (`schema-registry.properties`):

```properties
# HTTP listener
listeners=http://0.0.0.0:8081

# Kafka configuration
kafka.bootstrap.servers=PLAINTEXT://kafka-broker-1:9092,kafka-broker-2:9092,kafka-broker-3:9092

# Schema Registry Kafka topic
kafkastore.topic=_schemas

# Compatibility mode
kafkastore.topic.replication.factor=3
kafkastore.topic.min.insync.replicas=2

# Protobuf support
kafkastore.schema.registry.url=http://localhost:8081

# Security (if Kafka is secured)
schema.registry.inter.class=io.confluent.kafka.schemaregistry.security.KafkaSchemaRegistrySecurityModule
schema.registry.kafka.bootstrap.servers=SASL_SSL://kafka-broker-1:9093,kafka-broker-2:9093,kafka-broker-3:9093
schema.registry.kafka.security.protocol=SASL_SSL
schema.registry.kafka.sasl.mechanism=SCRAM-SHA-512
schema.registry.kafka.sasl.jaas.config=org.apache.kafka.common.security.scram.ScramLoginModule required \
  username="schema-registry" \
  password="schema-registry-password";
schema.registry.kafka.ssl.truststore.location=/path/to/truststore.jks
schema.registry.kafka.ssl.truststore.password=<truststore-password>

# HTTP Basic Auth (optional)
authentication.method=BASIC
authentication.realm=SchemaRegistry-Props
authentication.roles=admin,user
authentication.role.admin=admin
authentication.role.user=user
```

#### High Availability Setup

**Multi-Instance Configuration**:

- **Instance Count**: 3 instances (for HA)
- **Load Balancer**: Round-robin DNS or load balancer
- **Shared State**: All instances read/write to `_schemas` topic
- **Leader Election**: Automatic via Kafka topic

**Configuration for HA**:

```properties
# Master mode (one instance is master)
master.eligibility=true

# HTTP listener with master endpoint
listeners=http://0.0.0.0:8081
master.listener=http://schema-registry-1:8081
```

### Schema Management

#### Schema Registration

**Protobuf Schema Format**:

```protobuf
syntax = "proto3";

package escrow;

message CreateEscrow {
  string escrow_id = 1;
  string contract_id = 2;
  string buyer_id = 3;
  string seller_id = 4;
  string currency = 5;
  int64 amount_cents = 6;
  string network = 7;
  string trace_id = 8;
  string causation_id = 9;
  string correlation_id = 10;
  string version = 11;
}
```

**Registering Schema**:

```bash
# Register schema via REST API
curl -X POST http://schema-registry:8081/subjects/escrow.commands.v1-value/versions \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{
    "schemaType": "PROTOBUF",
    "schema": "<base64-encoded-protobuf-schema>"
  }'
```

**Schema Registry REST API**:

```bash
# List all subjects
curl http://schema-registry:8081/subjects

# Get latest schema version
curl http://schema-registry:8081/subjects/escrow.commands.v1-value/versions/latest

# Get schema by ID
curl http://schema-registry:8081/schemas/ids/1

# Check compatibility
curl -X POST http://schema-registry:8081/compatibility/subjects/escrow.commands.v1-value/versions/latest \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"schema": "<new-schema>"}'
```

#### Compatibility Policies

**Compatibility Modes**:

- **BACKWARD**: New consumers can read old events (default)
- **FORWARD**: Old consumers can read new events
- **FULL**: Both backward and forward compatible
- **NONE**: No compatibility checking

**Setting Compatibility**:

```bash
# Set compatibility mode for subject
curl -X PUT http://schema-registry:8081/config/escrow.commands.v1-value \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"compatibility": "BACKWARD"}'

# Set global compatibility mode
curl -X PUT http://schema-registry:8081/config \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"compatibility": "BACKWARD"}'
```

**Recommended Settings**:

- **Commands**: `BACKWARD` (new consumers handle old commands)
- **Events**: `BACKWARD` (new consumers handle old events)
- **Global Default**: `BACKWARD`

### Schema Evolution Strategy

#### Versioning Strategy

**Breaking Changes** (require new version):

- Removing required fields
- Changing field types
- Renaming fields (use new field, deprecate old)

**Non-Breaking Changes** (same version):

- Adding optional fields
- Removing optional fields (mark as deprecated first)
- Adding new message types

#### Migration Process

1. **Deploy New Schema**: Register new schema version alongside old
2. **Update Producers**: Producers emit both versions during transition
3. **Update Consumers**: Consumers handle both versions
4. **Deprecate Old Version**: Mark old version as deprecated
5. **Remove Old Version**: Delete after retention period

## Topic Creation Scripts

### Automated Topic Creation

**Script Location**: `scripts/infrastructure/create-kafka-topics.sh`

**Usage**:

```bash
# Create all topics (production)
./scripts/infrastructure/create-kafka-topics.sh --env production

# Create all topics (development)
./scripts/infrastructure/create-kafka-topics.sh --env development

# Create specific topic
./scripts/infrastructure/create-kafka-topics.sh --topic escrow.commands.v1
```

**Script Features**:

- Validates Kafka connectivity
- Creates topics with correct configuration
- Creates corresponding DLQ topics
- Verifies topic creation
- Idempotent (safe to run multiple times)

See `scripts/infrastructure/create-kafka-topics.sh` for complete implementation.

### Topic Configuration Template

**Standard Topic Configuration**:

```bash
# Command topics
kafka-topics --create \
  --topic {topic-name} \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=604800000 \
  --config min.insync.replicas=2 \
  --config compression.type=snappy \
  --config cleanup.policy=delete

# Event topics
kafka-topics --create \
  --topic {topic-name} \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=7776000000 \
  --config min.insync.replicas=2 \
  --config compression.type=snappy \
  --config cleanup.policy=compact \
  --config delete.retention.ms=86400000
```

**Topic-Specific Configurations**:

| Topic | Retention | Compaction | Min ISR |
|-------|-----------|------------|---------|
| `escrow.commands.v1` | 7 days | No | 2 |
| `escrow.events.v1` | 90 days | Yes | 2 |
| `payments.commands.v1` | 7 days | No | 2 |
| `payments.events.v1` | 90 days | Yes | 2 |
| `webhook.events.v1` | 90 days | Yes | 2 |
| `contracts.events.v1` | 90 days | Yes | 2 |

### Validation Scripts

**Verify Topic Configuration**:

```bash
# Check topic exists
kafka-topics --describe --topic escrow.commands.v1 --bootstrap-server localhost:9092

# Verify partition count
kafka-topics --describe --topic escrow.commands.v1 --bootstrap-server localhost:9092 | grep "PartitionCount"

# Verify replication factor
kafka-topics --describe --topic escrow.commands.v1 --bootstrap-server localhost:9092 | grep "ReplicationFactor"

# Check configuration
kafka-configs --describe --entity-type topics --entity-name escrow.commands.v1 \
  --bootstrap-server localhost:9092
```

## Dead Letter Queue Configuration

### DLQ Naming Convention

**Format**: `{source-topic}.dlq`

**Examples**:

- `escrow.commands.v1.dlq`
- `escrow.events.v1.dlq`
- `payments.commands.v1.dlq`
- `payments.events.v1.dlq`
- `webhook.events.v1.dlq`
- `contracts.events.v1.dlq`

### DLQ Topic Configuration

**Standard DLQ Configuration**:

```bash
kafka-topics --create \
  --topic {topic-name}.dlq \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=2592000000 \
  --config min.insync.replicas=2 \
  --config compression.type=snappy \
  --config cleanup.policy=delete \
  --config segment.ms=86400000
```

**DLQ Configuration Details**:

- **Retention**: 30 days (longer than source topics for investigation)
- **Partitions**: Same as source topic (preserve ordering)
- **Replication**: Same as source topic (high availability)
- **Compaction**: Disabled (keep all messages for investigation)
- **Cleanup Policy**: Delete (not compacted)

### DLQ Message Enrichment

**Enriched Message Structure**:

```protobuf
message DLQMessage {
  string original_topic = 1;
  int32 original_partition = 2;
  int64 original_offset = 3;
  bytes original_payload = 4;
  string original_key = 5;
  string error_type = 6;              // "TRANSIENT" | "PERMANENT" | "POISON"
  string error_message = 7;
  int32 retry_count = 8;
  string failed_at = 9;                // ISO 8601 timestamp
  string trace_id = 10;
  string correlation_id = 11;
  map<string, string> metadata = 12;   // Additional context
}
```

**Producer Enrichment Logic**:

```typescript
async function sendToDLQ(
  originalMessage: KafkaMessage,
  error: Error,
  retryCount: number
): Promise<void> {
  const dlqMessage: DLQMessage = {
    originalTopic: originalMessage.topic,
    originalPartition: originalMessage.partition,
    originalOffset: originalMessage.offset,
    originalPayload: originalMessage.value,
    originalKey: originalMessage.key?.toString(),
    errorType: classifyError(error),
    errorMessage: error.message,
    retryCount,
    failedAt: new Date().toISOString(),
    traceId: extractTraceId(originalMessage),
    correlationId: extractCorrelationId(originalMessage),
    metadata: {
      service: 'escrow-service',
      handler: 'processEscrowCommand',
      errorStack: error.stack,
    },
  };

  await producer.send({
    topic: `${originalMessage.topic}.dlq`,
    messages: [{
      key: originalMessage.key,
      value: protobufEncode(dlqMessage),
    }],
  });
}
```

### DLQ Monitoring Setup

**Key Metrics**:

- DLQ message count per topic
- DLQ message rate (messages/hour)
- Oldest message age in DLQ
- Error type distribution
- Retry count distribution

**Monitoring Queries**:

```promql
# DLQ message count
kafka_topic_partition_current_offset{topic=~".*\\.dlq"} - kafka_consumer_lag_sum{topic=~".*\\.dlq"}

# DLQ message rate
rate(kafka_topic_partition_current_offset{topic=~".*\\.dlq"}[5m])

# Oldest DLQ message age
time() - kafka_topic_partition_oldest_offset_timestamp{topic=~".*\\.dlq"}
```

See monitoring section for complete alert configuration.

## Monitoring and Alerting Setup

### Prometheus Configuration

#### Kafka Exporter

**JMX Exporter Configuration** (`kafka-jmx-config.yml`):

```yaml
rules:
  - pattern: kafka.server<type=(.+), name=(.+)><>Value
    name: kafka_server_$1_$2
    type: GAUGE
  - pattern: kafka.server<type=(.+), name=(.+), (.+)=(.+)><>Value
    name: kafka_server_$1_$2
    type: GAUGE
    labels:
      "$3": "$4"
```

**Kafka Exporter Deployment**:

```yaml
# docker-compose.yml excerpt
kafka-exporter:
  image: danielqsj/kafka-exporter:latest
  ports:
    - "9308:9308"
  environment:
    KAFKA_BROKERS: kafka-broker-1:9092,kafka-broker-2:9092,kafka-broker-3:9092
    KAFKA_LOG_LEVEL: info
  command:
    - --kafka.server=kafka-broker-1:9092
    - --kafka.server=kafka-broker-2:9092
    - --kafka.server=kafka-broker-3:9092
```

#### Prometheus Scrape Configuration

**Configuration** (`prometheus-config.yml`):

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'bloxtr8-escrow'
    environment: 'production'

scrape_configs:
  # Kafka Exporter
  - job_name: 'kafka'
    static_configs:
      - targets: ['kafka-exporter:9308']
    metrics_path: /metrics

  # Schema Registry
  - job_name: 'schema-registry'
    static_configs:
      - targets: ['schema-registry:8081']
    metrics_path: /metrics

  # Application Services
  - job_name: 'escrow-service'
    static_configs:
      - targets: ['escrow-service:9090']
    metrics_path: /metrics

  - job_name: 'payments-service'
    static_configs:
      - targets: ['payments-service:9090']
    metrics_path: /metrics

  # Kafka JMX Metrics
  - job_name: 'kafka-jmx'
    static_configs:
      - targets: ['kafka-broker-1:9999', 'kafka-broker-2:9999', 'kafka-broker-3:9999']
    metrics_path: /metrics
```

#### Alert Rules

**Alert Configuration** (`alerts.yml`):

```yaml
groups:
  - name: kafka_alerts
    interval: 30s
    rules:
      # DLQ Alerts
      - alert: DLQMessagesDetected
        expr: sum(kafka_topic_partition_current_offset{topic=~".*\\.dlq"}) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "DLQ messages detected"
          description: "{{ $value }} messages in DLQ topics"

      - alert: DLQMessagesHigh
        expr: sum(kafka_topic_partition_current_offset{topic=~".*\\.dlq"}) > 100
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High DLQ message count"
          description: "{{ $value }} messages in DLQ topics"

      # Consumer Lag Alerts
      - alert: ConsumerLagHigh
        expr: sum(kafka_consumer_lag_sum) > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High consumer lag detected"
          description: "Consumer lag is {{ $value }} messages"

      - alert: ConsumerLagCritical
        expr: sum(kafka_consumer_lag_sum) > 5000
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Critical consumer lag"
          description: "Consumer lag is {{ $value }} messages"

      # Broker Availability
      - alert: KafkaBrokerDown
        expr: up{job="kafka-jmx"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Kafka broker down"
          description: "Broker {{ $labels.instance }} is down"

      # Partition Leader Unavailable
      - alert: KafkaPartitionLeaderUnavailable
        expr: kafka_controller_offline_partitions_count > 0
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Kafka partition leader unavailable"
          description: "{{ $value }} partitions have no leader"

      # Under-Replicated Partitions
      - alert: KafkaUnderReplicatedPartitions
        expr: sum(kafka_controller_offline_partitions_count) > 0
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Under-replicated partitions"
          description: "{{ $value }} partitions are under-replicated"

      # ISR Shrinking
      - alert: KafkaISRShrinking
        expr: kafka_server_replicamanager_underreplicatedpartitions > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "ISR shrinking detected"
          description: "{{ $value }} partitions have shrinking ISR"

  - name: schema_registry_alerts
    interval: 30s
    rules:
      # Schema Registry Availability
      - alert: SchemaRegistryDown
        expr: up{job="schema-registry"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Schema Registry down"
          description: "Schema Registry is unavailable"

      # Schema Compatibility Failures
      - alert: SchemaCompatibilityFailure
        expr: increase(schema_registry_schema_compatibility_rate{compatibility="FAILURE"}[5m]) > 0
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Schema compatibility check failed"
          description: "Schema compatibility check failed for subject {{ $labels.subject }}"
```

### Grafana Dashboards

#### Kafka Overview Dashboard

**Key Panels**:

- **Broker Status**: Up/down status of all brokers
- **Message Rate**: Messages/second per topic
- **Consumer Lag**: Lag per consumer group
- **DLQ Size**: Messages in DLQ topics
- **Partition Count**: Active partitions per topic
- **Replication Status**: Under-replicated partitions

**Dashboard JSON**: See `scripts/infrastructure/grafana-dashboards/kafka-overview.json`

#### Schema Registry Dashboard

**Key Panels**:

- **Schema Registry Status**: Up/down status
- **Schema Versions**: Version count per subject
- **Compatibility Checks**: Success/failure rate
- **Schema Registrations**: Registration rate over time

**Dashboard JSON**: See `scripts/infrastructure/grafana-dashboards/schema-registry.json`

#### Application Metrics Dashboard

**Key Panels**:

- **Request Rate**: Requests/second per service
- **Error Rate**: Error percentage per service
- **Processing Time**: P50, P95, P99 latencies
- **Business Metrics**: Escrow creation rate, payment success rate

**Dashboard JSON**: See `scripts/infrastructure/grafana-dashboards/application-metrics.json`

### Key Metrics and SLOs

#### Service Level Objectives (SLOs)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Kafka Producer Latency | P95 < 10ms | Producer send latency |
| Kafka Consumer Lag | P95 < 100ms | Consumer lag per partition |
| Schema Registry Availability | 99.9% | Uptime percentage |
| DLQ Message Count | 0 | Messages in DLQ |
| Topic Availability | 99.95% | Partition leader availability |

#### Critical Metrics

**Kafka Metrics**:

- `kafka_server_replicamanager_underreplicatedpartitions`: Under-replicated partitions
- `kafka_controller_offline_partitions_count`: Offline partitions
- `kafka_network_requestmetrics_totaltimems`: Request latency
- `kafka_server_brokertopicmetrics_messagesinpersec`: Message rate

**Consumer Metrics**:

- `kafka_consumer_lag_sum`: Total consumer lag
- `kafka_consumer_lag_max`: Maximum lag per partition
- `kafka_consumer_fetch_rate`: Fetch rate per consumer

**Producer Metrics**:

- `kafka_producer_record_send_total`: Records sent
- `kafka_producer_record_send_rate`: Send rate
- `kafka_producer_record_error_total`: Send errors

## Deployment Procedures

### Development Environment

#### Docker Compose Setup

**Prerequisites**:

- Docker Compose 2.0+
- 8GB RAM available
- 20GB disk space

**Deployment Steps**:

```bash
# Start Kafka and Schema Registry
docker-compose up -d kafka schema-registry

# Wait for services to be ready
sleep 30

# Create topics
./scripts/infrastructure/create-kafka-topics.sh --env development

# Setup Schema Registry
./scripts/infrastructure/setup-schema-registry.sh --env development

# Verify setup
./scripts/infrastructure/verify-infrastructure.sh
```

**Docker Compose Services**:

```yaml
kafka:
  image: apache/kafka:3.5.0
  ports:
    - "9092:9092"
  environment:
    KAFKA_NODE_ID: 1
    KAFKA_PROCESS_ROLES: broker,controller
    KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
    KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9094
    KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
    KAFKA_LOG_DIRS: /tmp/kafka-logs
  volumes:
    - kafka-data:/tmp/kafka-logs

schema-registry:
  image: confluentinc/cp-schema-registry:7.5.0
  ports:
    - "8081:8081"
  environment:
    SCHEMA_REGISTRY_HOST_NAME: schema-registry
    SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka:9092
    SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081
  depends_on:
    - kafka
```

### Production Environment

#### Infrastructure Provisioning

**Cloud Provider**: AWS / GCP / Azure

**Resources Required**:

- 3 Kafka broker instances (EC2/GCE/VMs)
- 3 Schema Registry instances (containerized)
- Load balancer for Schema Registry
- Security groups / firewall rules
- Persistent storage volumes

**Deployment Steps**:

1. **Provision Infrastructure**:
   ```bash
   # Provision Kafka brokers
   terraform apply -target=module.kafka

   # Provision Schema Registry
   terraform apply -target=module.schema_registry
   ```

2. **Configure Security**:
   ```bash
   # Generate certificates
   ./scripts/infrastructure/generate-certificates.sh

   # Configure SASL/SCRAM
   ./scripts/infrastructure/setup-sasl.sh
   ```

3. **Start Kafka Cluster**:
   ```bash
   # Start brokers
   systemctl start kafka

   # Verify cluster health
   kafka-broker-api-versions --bootstrap-server kafka-broker-1:9093
   ```

4. **Create Topics**:
   ```bash
   ./scripts/infrastructure/create-kafka-topics.sh --env production
   ```

5. **Setup Schema Registry**:
   ```bash
   ./scripts/infrastructure/setup-schema-registry.sh --env production
   ```

6. **Deploy Monitoring**:
   ```bash
   # Start Prometheus
   docker-compose -f monitoring-compose.yml up -d

   # Import Grafana dashboards
   ./scripts/infrastructure/import-grafana-dashboards.sh
   ```

#### Health Checks

**Kafka Health Check**:

```bash
# Check broker status
kafka-broker-api-versions --bootstrap-server kafka-broker-1:9093

# Check topic status
kafka-topics --list --bootstrap-server kafka-broker-1:9093

# Check consumer groups
kafka-consumer-groups --bootstrap-server kafka-broker-1:9093 --list
```

**Schema Registry Health Check**:

```bash
# Check Schema Registry status
curl http://schema-registry:8081/subjects

# Check schema count
curl http://schema-registry:8081/subjects | jq length
```

## Troubleshooting Guide

### Common Issues

#### Issue: Broker Not Starting

**Symptoms**:
- Broker fails to start
- Port already in use error

**Diagnosis**:
```bash
# Check if port is in use
netstat -tuln | grep 9092

# Check broker logs
tail -f /var/log/kafka/server.log
```

**Resolution**:
- Stop conflicting process
- Check `server.properties` for correct port configuration
- Verify disk space availability

#### Issue: Consumer Lag Increasing

**Symptoms**:
- Consumer lag metrics increasing
- Messages not being processed

**Diagnosis**:
```bash
# Check consumer lag
kafka-consumer-groups --bootstrap-server localhost:9092 \
  --group escrow-service --describe

# Check consumer logs
tail -f /var/log/escrow-service/consumer.log
```

**Resolution**:
- Scale consumers horizontally
- Check consumer processing time
- Investigate slow database queries
- Verify network connectivity

#### Issue: Schema Compatibility Failure

**Symptoms**:
- Schema registration fails
- Producer unable to publish messages

**Diagnosis**:
```bash
# Check compatibility
curl -X POST http://schema-registry:8081/compatibility/subjects/escrow.commands.v1-value/versions/latest \
  -H "Content-Type: application/vnd.schemaregistry.v1+json" \
  -d '{"schema": "<new-schema>"}'
```

**Resolution**:
- Review schema changes for breaking changes
- Update compatibility mode if needed
- Use schema versioning for breaking changes

#### Issue: DLQ Messages Accumulating

**Symptoms**:
- DLQ message count increasing
- Errors in consumer logs

**Diagnosis**:
```bash
# Check DLQ messages
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic escrow.commands.v1.dlq --from-beginning

# Check error types
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic escrow.commands.v1.dlq --from-beginning | \
  jq '.error_type' | sort | uniq -c
```

**Resolution**:
- Investigate root cause of errors
- Fix application bugs
- Replay DLQ messages after fix
- Update error handling logic

### Recovery Procedures

#### Recovering from Broker Failure

1. **Identify Failed Broker**:
   ```bash
   kafka-broker-api-versions --bootstrap-server kafka-broker-1:9093
   ```

2. **Check Partition Leaders**:
   ```bash
   kafka-topics --describe --topic escrow.commands.v1 \
     --bootstrap-server kafka-broker-1:9093
   ```

3. **Restart Broker**:
   ```bash
   systemctl restart kafka
   ```

4. **Verify Recovery**:
   ```bash
   # Check ISR status
   kafka-topics --describe --topic escrow.commands.v1 \
     --bootstrap-server kafka-broker-1:9093 | grep ISR
   ```

#### Recovering from Schema Registry Failure

1. **Check Schema Registry Status**:
   ```bash
   curl http://schema-registry:8081/subjects
   ```

2. **Restart Schema Registry**:
   ```bash
   systemctl restart schema-registry
   ```

3. **Verify Schema Recovery**:
   ```bash
   # Check schema count
   curl http://schema-registry:8081/subjects | jq length
   ```

### Performance Tuning

#### Reducing Consumer Lag

**Actions**:
- Increase consumer instances
- Optimize consumer processing logic
- Increase `fetch.max.bytes` and `fetch.max.wait.ms`
- Use parallel processing within consumer

**Configuration**:
```properties
fetch.min.bytes=1024
fetch.max.wait.ms=500
max.partition.fetch.bytes=1048576
```

#### Improving Producer Throughput

**Actions**:
- Enable compression (`compression.type=snappy`)
- Increase batch size (`batch.size=16384`)
- Tune linger time (`linger.ms=10`)
- Use async sending

**Configuration**:
```properties
compression.type=snappy
batch.size=16384
linger.ms=10
acks=1  # For high throughput (with durability tradeoff)
```

## Related Documentation

- [Topic Catalog](../../architecture/escrow/topic-catalog.md) - Complete Kafka topic inventory
- [Event Schemas](../../architecture/escrow/event-schemas.md) - Protobuf schema definitions
- [Escrow System Architecture](../../architecture/escrow/escrow-system-architecture.md) - Architecture overview
- [Observability](../../architecture/escrow/observability.md) - Monitoring and metrics
- [Error Handling](../../architecture/escrow/error-handling-retries.md) - DLQ and retry strategies

