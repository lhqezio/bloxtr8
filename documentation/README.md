# Bloxtr8 Documentation

Enterprise-grade technical documentation for Bloxtr8, a Discord-native escrow and verification platform handling $300M+ in annual Roblox game trades.

## Platform Overview

Bloxtr8 is a modern, event-driven escrow platform built on a microservices-inspired architecture. The system facilitates secure transactions between buyers and sellers of Roblox games, with enterprise-grade security, compliance, and reliability.

**Key Capabilities**:

- Multi-rail payment processing (Stripe for ≤$10k, USDC on Base for >$10k)
- Discord-native user experience
- Roblox game ownership verification
- KYC/AML compliance
- Automated escrow management
- Dispute resolution framework

**Architecture**: Event-driven microservices with Apache Kafka, PostgreSQL, and modern TypeScript/Node.js stack.

## Documentation Structure

### Overview

- [System Overview](architecture/system-overview.md) - High-level architecture, components, and data flows
- [Monorepo Structure](architecture/monorepo.md) - Workspace organization and build system

### Architecture

#### Core System Architecture

- [System Overview](architecture/system-overview.md) - Complete system architecture with Kafka event-driven design
- [Database Schema](architecture/database-schema.md) - Data models, relationships, and indexes
- [Business Flow](architecture/business-flow.md) - End-to-end transaction flows from signup to payment release

#### Escrow Architecture (Event-Driven)

- [Escrow System Architecture](architecture/escrow/escrow-system-architecture.md) - Event-driven escrow architecture, service boundaries, Kafka setup, and data consistency
- [Topic Catalog](architecture/escrow/topic-catalog.md) - Complete Kafka topic inventory, partitioning strategies, retention policies, and producer/consumer mappings
- [Event Schemas](architecture/escrow/event-schemas.md) - Protobuf schema definitions for all commands and events
- [State Machine](architecture/escrow/state-machine.md) - Escrow state transitions, guards, idempotency rules, and state ownership
- [Sequence Flows](architecture/escrow/sequence-flows.md) - Detailed sequence diagrams for all escrow flows (Stripe, USDC, delivery, release, refund, dispute)
- [Error Handling & Retries](architecture/escrow/error-handling-retries.md) - Retry strategies, dead letter queue (DLQ) management, compensation patterns, and recovery procedures
- [Observability](architecture/escrow/observability.md) - Distributed tracing, metrics, logging, reconciliation jobs, and alert definitions
- [Security & Compliance](architecture/escrow/security-compliance.md) - Security architecture, PCI compliance, KYC/AML, webhook security, secrets management, and audit logging

#### Payment System

- [Payment System](architecture/payment-system.md) - Multi-rail payment implementation (Stripe and USDC on Base) with event-driven architecture

### Development

- [Getting Started](guides/getting-started.md) - Local development environment setup
- [Development Guide](guides/development.md) - Development workflow, coding standards, and best practices
- [API Reference](api/README.md) - REST API documentation

### Operations

- [Deployment](operations/deployment.md) - Production deployment procedures
- [Security Policy](../SECURITY.md) - Security disclosure policy

## Architecture Highlights

### Event-Driven Design

The escrow system is built on Apache Kafka for event-driven communication:

- **Commands**: Request-response pattern for state changes (e.g., `CreateEscrow`, `MarkDelivered`, `ReleaseFunds`)
- **Events**: Domain events for state changes (e.g., `EscrowCreated`, `EscrowFundsHeld`, `EscrowReleased`)
- **Partitioning**: Keyed by `escrow_id` for ordering guarantees and idempotent processing
- **Outbox Pattern**: Transactional event publishing ensures consistency

### Service Boundaries

- **API Gateway**: Request validation, authentication, command emission, query handling
- **Escrow Service**: Escrow state machine owner, business logic coordinator
- **Payments Service**: Payment provider integration (Stripe, Custodian), wallet screening
- **Notifications Service**: User notifications via Discord
- **Projections Service**: Read-optimized views for queries

### Communication Patterns

- **Edge**: REST + JSON (browser and Discord Bot compatibility)
- **Internal**: Kafka + Protobuf (efficient, type-safe, schema-evolved)

### Security & Compliance

- **PCI Compliance**: No card data storage, Stripe Elements for PCI scope minimization
- **KYC/AML**: Tiered KYC system, wallet screening for USDC (TRM Labs + Chainalysis)
- **Webhook Security**: Signature verification for all external webhooks
- **Secrets Management**: AWS Secrets Manager with rotation
- **Audit Logging**: Complete audit trail with 7-year retention

### Observability

- **Distributed Tracing**: Full request tracing across services via trace_id propagation
- **Metrics**: Business metrics (escrow counts, payment success rates) and system metrics (latency, error rates)
- **Logging**: Structured JSON logging with trace correlation
- **Reconciliation**: Daily reconciliation jobs ensure consistency between escrow state and payment providers

## Key Design Decisions

1. **Event-Driven Architecture**: Kafka for loose coupling, scalability, and auditability
2. **Protobuf on Kafka**: Efficient serialization, schema evolution, type safety
3. **REST at Edge**: Browser and Discord Bot compatibility
4. **Outbox Pattern**: Transactional event publishing ensures consistency
5. **Idempotency**: All operations idempotent via event_id deduplication
6. **State Machine**: Centralized escrow state machine in Escrow Service
7. **Multi-Rail Payments**: Stripe for ≤$10k, USDC on Base for >$10k

## Getting Started

1. **New to the Platform**: Start with [System Overview](architecture/system-overview.md) for high-level architecture
2. **Implementing Escrow**: Read [Escrow System Architecture](architecture/escrow/escrow-system-architecture.md) for architecture details
3. **Understanding Flows**: See [Sequence Flows](architecture/escrow/sequence-flows.md) for detailed flow diagrams
4. **Setting Up Development**: Follow [Getting Started](guides/getting-started.md) for local setup
