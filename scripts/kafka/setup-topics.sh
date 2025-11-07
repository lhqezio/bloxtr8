#!/usr/bin/env bash

# Kafka Topic Provisioning Script
# Creates all Kafka topics and DLQs required for the Bloxtr8 escrow platform.

set -euo pipefail

ENVIRONMENT="${ENV:-development}"
BOOTSTRAP_SERVERS="${BOOTSTRAP_SERVERS:-localhost:9092,localhost:9093,localhost:9094}"
TARGET_TOPIC=""
DRY_RUN=false
DOCKER_SERVICE="${DOCKER_SERVICE:-kafka-1}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Provision Kafka topics and DLQs for the Bloxtr8 escrow platform.

Options:
  --env ENV                 Environment (development|production). Defaults to env var ENV or "development".
  --bootstrap-servers HOSTS Comma-separated list of Kafka bootstrap servers. Defaults to ENV VAR BOOTSTRAP_SERVERS or localhost trio.
  --topic NAME               Create only the specified topic.
  --dry-run                  Print actions without executing.
  --docker-service NAME      Docker Compose service to exec commands in (default: kafka-1).
  --help                     Show this help text.

Examples:
  $0 --env development
  $0 --env production --bootstrap-servers broker-1:9092,broker-2:9092,broker-3:9092
  $0 --topic escrow.events.v1
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --bootstrap-servers)
      BOOTSTRAP_SERVERS="$2"
      shift 2
      ;;
    --topic)
      TARGET_TOPIC="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --docker-service)
      DOCKER_SERVICE="$2"
      shift 2
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      error "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

if [[ "$ENVIRONMENT" != "development" && "$ENVIRONMENT" != "production" ]]; then
  error "Invalid environment: $ENVIRONMENT. Expected 'development' or 'production'."
  exit 1
fi

PARTITIONS=12
if [[ "$ENVIRONMENT" == "production" ]]; then
  REPLICATION_FACTOR=3
  MIN_IN_SYNC_REPLICAS=2
else
  REPLICATION_FACTOR=1
  MIN_IN_SYNC_REPLICAS=1
fi

# Determine if we should run kafka-topics via Docker.
USE_DOCKER=false
if ! command -v kafka-topics >/dev/null 2>&1; then
  if docker compose ps "$DOCKER_SERVICE" 2>/dev/null | grep -qE "Up|healthy"; then
    USE_DOCKER=true
  else
    warn "kafka-topics binary not found and Docker service '$DOCKER_SERVICE' unavailable. Commands may fail."
  fi
fi

run_kafka_topics() {
  if [[ "$USE_DOCKER" == true ]]; then
    docker compose exec -T "$DOCKER_SERVICE" kafka-topics "$@"
  else
    kafka-topics "$@"
  fi
}

check_connectivity() {
  info "Validating connectivity to Kafka bootstrap servers: $BOOTSTRAP_SERVERS"
  if [[ "$DRY_RUN" == true ]]; then
    warn "Skipping connectivity check in dry-run mode."
    return 0
  fi

  if run_kafka_topics --bootstrap-server "$BOOTSTRAP_SERVERS" --list >/dev/null 2>&1; then
    info "Kafka connection successful."
    return 0
  fi

  error "Unable to reach Kafka brokers via $BOOTSTRAP_SERVERS"
  return 1
}

topic_exists() {
  local topic="$1"
  run_kafka_topics --bootstrap-server "$BOOTSTRAP_SERVERS" --list 2>/dev/null | grep -qx "$topic"
}

create_topic() {
  local topic_name="$1"
  local retention_ms="$2"
  local cleanup_policy="$3"
  local enable_compaction="$4"

  if topic_exists "$topic_name"; then
    warn "Topic $topic_name already exists. Skipping."
    return 0
  fi

  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Create topic $topic_name"
    info "  Partitions: $PARTITIONS"
    info "  Replication Factor: $REPLICATION_FACTOR"
    info "  Retention: ${retention_ms}ms"
    info "  Cleanup Policy: $cleanup_policy"
    info "  Compaction: $enable_compaction"
    return 0
  fi

  local args=(
    --create
    --topic "$topic_name"
    --bootstrap-server "$BOOTSTRAP_SERVERS"
    --partitions "$PARTITIONS"
    --replication-factor "$REPLICATION_FACTOR"
    --config "retention.ms=$retention_ms"
    --config "compression.type=snappy"
    --config "cleanup.policy=$cleanup_policy"
    --config "min.insync.replicas=$MIN_IN_SYNC_REPLICAS"
  )

  if [[ "$enable_compaction" == true ]]; then
    args+=(--config "delete.retention.ms=86400000")
  fi

  info "Creating topic $topic_name"
  if run_kafka_topics "${args[@]}"; then
    info "Topic created: $topic_name"
  else
    error "Failed to create topic: $topic_name"
    return 1
  fi
}

create_dlq_topic() {
  local source_topic="$1"
  local dlq_topic="${source_topic}.dlq"
  create_topic "$dlq_topic" 2592000000 delete false
}

describe_topic() {
  local topic_name="$1"
  if [[ "$DRY_RUN" == true ]]; then
    return 0
  fi

  if ! topic_exists "$topic_name"; then
    error "Topic verification failed: $topic_name"
    return 1
  fi

  info "Verified topic: $topic_name"
  local description
  description=$(run_kafka_topics --bootstrap-server "$BOOTSTRAP_SERVERS" --describe --topic "$topic_name" 2>/dev/null || true)
  if [[ -n "$description" ]]; then
    echo "$description" | grep -E "PartitionCount|ReplicationFactor|Configs" | sed 's/^/  /'
  fi
}

provision_topic_group() {
  local topic_name="$1"
  local retention="$2"
  local cleanup="$3"
  local compaction="$4"

  if ! create_topic "$topic_name" "$retention" "$cleanup" "$compaction"; then
    return 1
  fi
  describe_topic "$topic_name"

  if ! create_dlq_topic "$topic_name"; then
    return 1
  fi
  describe_topic "${topic_name}.dlq"
}

provision_all_topics() {
  local definitions=(
    "escrow.commands.v1:604800000:delete:false"
    "payments.commands.v1:604800000:delete:false"
    "escrow.events.v1:7776000000:compact:true"
    "payments.events.v1:7776000000:compact:true"
    "webhook.events.v1:7776000000:compact:true"
    "contracts.events.v1:7776000000:compact:true"
  )

  local failures=()

  for definition in "${definitions[@]}"; do
    IFS=':' read -r topic retention cleanup compaction <<<"$definition"

    if [[ -n "$TARGET_TOPIC" && "$TARGET_TOPIC" != "$topic" ]]; then
      continue
    fi

    if ! provision_topic_group "$topic" "$retention" "$cleanup" "$compaction"; then
      failures+=("$topic")
    fi
    echo
  done

  if [[ ${#failures[@]} -gt 0 ]]; then
    error "Failed topics: ${failures[*]}"
    return 1
  fi

  info "All topic provisioning completed."
}

main() {
  info "Environment: $ENVIRONMENT"
  info "Partitions: $PARTITIONS"
  info "Replication Factor: $REPLICATION_FACTOR (min ISR: $MIN_IN_SYNC_REPLICAS)"
  info "Bootstrap servers: $BOOTSTRAP_SERVERS"
  if [[ "$USE_DOCKER" == true ]]; then
    info "Executing kafka-topics via Docker service: $DOCKER_SERVICE"
  fi
  echo

  if ! check_connectivity; then
    if [[ "$DRY_RUN" == true ]]; then
      warn "Continuing despite failed connectivity check (dry run)."
    else
      exit 1
    fi
  fi

  if [[ -n "$TARGET_TOPIC" ]]; then
    info "Provisioning single topic: $TARGET_TOPIC"
    if [[ "$TARGET_TOPIC" == *".commands.v1" ]]; then
      provision_topic_group "$TARGET_TOPIC" 604800000 delete false
    elif [[ "$TARGET_TOPIC" == *".events.v1" ]]; then
      provision_topic_group "$TARGET_TOPIC" 7776000000 compact true
    else
      error "Unknown topic type: $TARGET_TOPIC"
      exit 1
    fi
  else
    provision_all_topics
  fi

  info "Done."
}

main "$@"

