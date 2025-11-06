# Schema Registry Configuration

This directory contains Schema Registry configuration documentation.

## Configuration

Schema Registry is configured via environment variables in `docker-compose.yml`:

- `SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS=PLAINTEXT://kafka:9092` - Connects to Kafka using Docker service name
- `SCHEMA_REGISTRY_LISTENERS=http://0.0.0.0:8081` - HTTP API listener
- `SCHEMA_REGISTRY_KAFKASTORE_TOPIC_REPLICATION_FACTOR=1` - Replication factor for development

## Important Notes

1. **Use `PLAINTEXT://` prefix**: The bootstrap servers must include the protocol prefix (`PLAINTEXT://kafka:9092`)
2. **Kafka advertised listeners**: Kafka must advertise itself as `kafka:9092` (not `localhost:9092`) for Docker network connectivity
3. **Service name resolution**: Both services must be on the same Docker network (default network works)

## Verification

Test Schema Registry connectivity:

```bash
curl http://localhost:8081/subjects
```

Expected response: `[]` (empty array if no schemas registered)
