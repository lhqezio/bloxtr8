# @bloxtr8/protobuf-schemas

Protobuf schema definitions for all commands and events in the Bloxtr8 escrow system.

## Overview

This package contains:

- **Protobuf schema files** (`.proto`) defining all commands and events
- **Generated TypeScript types** for type-safe message serialization/deserialization
- **Schema Registry integration** for Kafka message validation

## Package Structure

```
packages/protobuf-schemas/
├── schemas/              # Protobuf source files (.proto)
│   ├── escrow-commands.proto
│   ├── escrow-events.proto
│   ├── payments-commands.proto
│   ├── payments-events.proto
│   ├── webhook-events.proto
│   └── contracts-events.proto
├── generated/            # Generated TypeScript (committed to git)
├── index.ts              # Re-exports generated types
└── package.json
```

## Usage

### Installing

This package is part of the Bloxtr8 monorepo and available as a workspace dependency:

```json
{
  "dependencies": {
    "@bloxtr8/protobuf-schemas": "workspace:*"
  }
}
```

### Importing Types

```typescript
import {
  CreateEscrow,
  EscrowCreated,
  PaymentSucceeded,
} from '@bloxtr8/protobuf-schemas';
```

### Serializing/Deserializing Messages

```typescript
import { CreateEscrow } from '@bloxtr8/protobuf-schemas';
import { toBinary, fromBinary } from '@bufbuild/protobuf';

// Create a message
const command = new CreateEscrow({
  escrowId: 'escrow_123',
  contractId: 'contract_456',
  buyerId: 'user_789',
  sellerId: 'user_012',
  currency: 'USD',
  amountCents: 10000n,
  network: '',
  traceId: 'trace_123',
  causationId: 'event_456',
  correlationId: 'req_789',
  version: 'v1',
});

// Serialize to binary
const binary = toBinary(command);

// Deserialize from binary
const deserialized = fromBinary(CreateEscrow, binary);
```

## Development

### Generating TypeScript Types

After modifying `.proto` files, regenerate TypeScript types:

```bash
pnpm --filter @bloxtr8/protobuf-schemas generate
```

This runs `buf generate` which reads `buf.gen.yaml` and outputs TypeScript to `generated/`.

### Validating Schemas

Validate Protobuf schemas:

```bash
pnpm --filter @bloxtr8/protobuf-schemas validate
```

This runs:

- `buf lint` - Checks for schema errors
- `buf format --diff --exit-code` - Checks formatting

### Formatting Schemas

Format Protobuf schemas:

```bash
pnpm --filter @bloxtr8/protobuf-schemas format
```

This runs `buf format --write` to format all `.proto` files.

## Adding New Schemas

1. **Add message to appropriate `.proto` file**:
   - Commands → `*-commands.proto`
   - Events → `*-events.proto`

2. **Follow schema conventions**:
   - Use `proto3` syntax
   - snake_case for field names
   - Include standard fields (see below)

3. **Generate TypeScript**:

   ```bash
   pnpm --filter @bloxtr8/protobuf-schemas generate
   ```

4. **Update exports** in `index.ts` if needed (usually auto-exported)

5. **Register in Schema Registry** (see below)

## Schema Conventions

### Standard Fields

**Commands** should include:

- `event_id` - Unique identifier for idempotency (UUID)
- `trace_id` - Distributed tracing identifier (UUID)
- `correlation_id` - Request correlation identifier (UUID)
- `causation_id` - Parent event identifier (UUID)
- `version` - Schema version string (e.g., "v1")

**Events** should include:

- `event_id` - Unique identifier (UUID)
- `occurred_at` - ISO 8601 timestamp
- `causation_id` - Parent command/event identifier (UUID)
- `version` - Schema version string (e.g., "v1")

### Field Types

- **IDs**: `string` (UUIDs/CUIDs)
- **Amounts**: `int64` (amounts in cents or smallest unit)
- **Timestamps**: `string` (ISO 8601 format)
- **Enums**: `string` (e.g., "USD" | "USDC", "RELEASE" | "REFUND")

## Schema Registry Integration

Schemas are registered in Confluent Schema Registry for Kafka message validation.

### Registering Schemas

Use the setup script:

```bash
./scripts/kafka/setup-schema-registry.sh --env development
```

This registers all schemas from `packages/protobuf-schemas/schemas/` to Schema Registry.

### Schema Subjects

Schemas are registered with the following subjects:

- `escrow.commands.v1-value` → `escrow-commands.proto`
- `escrow.events.v1-value` → `escrow-events.proto`
- `payments.commands.v1-value` → `payments-commands.proto`
- `payments.events.v1-value` → `payments-events.proto`
- `webhook.events.v1-value` → `webhook-events.proto`
- `contracts.events.v1-value` → `contracts-events.proto`

### Compatibility Mode

All schemas use **BACKWARD** compatibility mode, meaning:

- New consumers can read old events
- Breaking changes require a new version (e.g., `v2`)
- Optional fields can be added safely

## Versioning Policy

### Schema Versioning

- **Minor changes** (backward compatible): Same version (e.g., `v1`)
  - Adding optional fields
  - Adding new message types
  - Documentation changes

- **Breaking changes**: New version (e.g., `v2`)
  - Removing fields
  - Changing field types
  - Renaming fields (use new field, deprecate old)

### Migration Process

1. Deploy new schema version alongside old version
2. Producers emit both versions during transition period
3. Consumers upgraded to handle both versions
4. Deprecate old version after all consumers upgraded
5. Remove old version topic after retention period

## Related Documentation

- [Event Schemas](../../documentation/architecture/escrow/event-schemas.md) - Detailed schema documentation
- [Topic Catalog](../../documentation/architecture/escrow/topic-catalog.md) - Kafka topic inventory
- [Escrow System Architecture](../../documentation/architecture/escrow/escrow-system-architecture.md) - Architecture overview

## Dependencies

- `@bufbuild/protobuf` - Protobuf runtime for TypeScript
- `@bufbuild/protoc-gen-es` - TypeScript code generator
- `buf` CLI - Protobuf tooling (install separately: `brew install bufbuild/buf/buf`)

## License

ISC
