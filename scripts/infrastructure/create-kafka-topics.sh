#!/bin/bash

# Kafka Topic Creation Script
# Creates all Kafka topics and DLQ topics for the Bloxtr8 escrow system

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENV="${ENV:-development}"
BROKER="${BROKER:-localhost:9092}"
TOPIC=""
DRY_RUN=false

# Topic configurations
declare -A TOPIC_CONFIGS

# Function to print colored messages
info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Creates Kafka topics and DLQ topics for the Bloxtr8 escrow system.

OPTIONS:
    --env ENV           Environment (development|production) [default: development]
    --broker BROKER     Kafka broker address [default: localhost:9092]
    --topic TOPIC       Create specific topic only
    --dry-run           Show what would be created without creating
    --help              Show this help message

EXAMPLES:
    # Create all topics for development
    $0 --env development

    # Create all topics for production
    $0 --env production --broker kafka-broker-1:9093

    # Create specific topic
    $0 --topic escrow.commands.v1

    # Dry run
    $0 --dry-run
EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --env)
            ENV="$2"
            shift 2
            ;;
        --broker)
            BROKER="$2"
            shift 2
            ;;
        --topic)
            TOPIC="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
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

# Validate environment
if [[ "$ENV" != "development" && "$ENV" != "production" ]]; then
    error "Invalid environment: $ENV. Must be 'development' or 'production'"
    exit 1
fi

# Set configuration based on environment
if [[ "$ENV" == "production" ]]; then
    REPLICATION_FACTOR=3
    MIN_ISR=2
    PARTITIONS=12
else
    REPLICATION_FACTOR=1
    MIN_ISR=1
    PARTITIONS=12
fi

# Function to check Kafka connectivity
check_kafka_connectivity() {
    info "Checking Kafka connectivity to $BROKER..."
    
    if command -v kafka-topics &> /dev/null; then
        if kafka-topics --bootstrap-server "$BROKER" --list &> /dev/null; then
            info "Kafka is accessible"
            return 0
        else
            error "Cannot connect to Kafka at $BROKER"
            return 1
        fi
    else
        warn "kafka-topics command not found. Skipping connectivity check."
        return 0
    fi
}

# Function to check if topic exists
topic_exists() {
    local topic_name=$1
    kafka-topics --bootstrap-server "$BROKER" --list 2>/dev/null | grep -q "^${topic_name}$" || return 1
}

# Function to create topic
create_topic() {
    local topic_name=$1
    local retention_ms=$2
    local cleanup_policy=$3
    local enable_compaction=${4:-false}
    
    # Check if topic already exists
    if topic_exists "$topic_name"; then
        warn "Topic $topic_name already exists. Skipping."
        return 0
    fi
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would create topic: $topic_name"
        info "  Partitions: $PARTITIONS"
        info "  Replication Factor: $REPLICATION_FACTOR"
        info "  Retention: ${retention_ms}ms"
        info "  Cleanup Policy: $cleanup_policy"
        return 0
    fi
    
    info "Creating topic: $topic_name"
    
    local cmd="kafka-topics --create \
        --topic $topic_name \
        --bootstrap-server $BROKER \
        --partitions $PARTITIONS \
        --replication-factor $REPLICATION_FACTOR \
        --config retention.ms=$retention_ms \
        --config min.insync.replicas=$MIN_ISR \
        --config compression.type=snappy \
        --config cleanup.policy=$cleanup_policy"
    
    if [[ "$enable_compaction" == true ]]; then
        cmd="$cmd --config delete.retention.ms=86400000"
    fi
    
    if eval "$cmd"; then
        info "Successfully created topic: $topic_name"
    else
        error "Failed to create topic: $topic_name"
        return 1
    fi
}

# Function to create DLQ topic
create_dlq_topic() {
    local source_topic=$1
    local dlq_topic="${source_topic}.dlq"
    
    # DLQ configuration: 30 days retention, no compaction
    create_topic "$dlq_topic" "2592000000" "delete" false
}

# Function to verify topic creation
verify_topic() {
    local topic_name=$1
    
    if [[ "$DRY_RUN" == true ]]; then
        return 0
    fi
    
    if topic_exists "$topic_name"; then
        info "Verified topic exists: $topic_name"
        
        # Get topic details
        local details=$(kafka-topics --bootstrap-server "$BROKER" \
            --describe --topic "$topic_name" 2>/dev/null)
        
        if [[ -n "$details" ]]; then
            info "Topic details:"
            echo "$details" | grep -E "PartitionCount|ReplicationFactor|Configs" | \
                sed 's/^/  /'
        fi
        return 0
    else
        error "Topic verification failed: $topic_name"
        return 1
    fi
}

# Main topic creation function
create_all_topics() {
    info "Creating Kafka topics for environment: $ENV"
    info "Broker: $BROKER"
    info "Replication Factor: $REPLICATION_FACTOR"
    info "Min ISR: $MIN_ISR"
    info "Partitions: $PARTITIONS"
    echo ""
    
    # Define topics with their configurations
    # Format: topic_name retention_ms cleanup_policy enable_compaction
    local topics=(
        # Command topics (7 days retention, no compaction)
        "escrow.commands.v1:604800000:delete:false"
        "payments.commands.v1:604800000:delete:false"
        
        # Event topics (90 days retention, compaction enabled)
        "escrow.events.v1:7776000000:compact:true"
        "payments.events.v1:7776000000:compact:true"
        "webhook.events.v1:7776000000:compact:true"
        "contracts.events.v1:7776000000:compact:true"
    )
    
    local failed_topics=()
    
    # Create topics
    for topic_config in "${topics[@]}"; do
        IFS=':' read -r topic_name retention_ms cleanup_policy enable_compaction <<< "$topic_config"
        
        # Skip if specific topic requested and doesn't match
        if [[ -n "$TOPIC" && "$topic_name" != "$TOPIC" ]]; then
            continue
        fi
        
        # Create main topic
        if ! create_topic "$topic_name" "$retention_ms" "$cleanup_policy" "$enable_compaction"; then
            failed_topics+=("$topic_name")
            continue
        fi
        
        # Verify topic
        verify_topic "$topic_name"
        
        # Create DLQ topic
        if ! create_dlq_topic "$topic_name"; then
            failed_topics+=("${topic_name}.dlq")
        else
            verify_topic "${topic_name}.dlq"
        fi
        
        echo ""
    done
    
    # Summary
    echo ""
    info "Topic creation summary:"
    if [[ ${#failed_topics[@]} -eq 0 ]]; then
        info "All topics created successfully!"
    else
        error "Failed to create the following topics:"
        for topic in "${failed_topics[@]}"; do
            error "  - $topic"
        done
        exit 1
    fi
}

# Main execution
main() {
    # Check Kafka connectivity
    if ! check_kafka_connectivity; then
        if [[ "$DRY_RUN" == false ]]; then
            error "Cannot proceed without Kafka connectivity"
            exit 1
        fi
    fi
    
    # Create topics
    if [[ -n "$TOPIC" ]]; then
        info "Creating specific topic: $TOPIC"
        # Extract configuration for specific topic
        if [[ "$TOPIC" == *".commands.v1" ]]; then
            create_topic "$TOPIC" "604800000" "delete" false
            create_dlq_topic "$TOPIC"
        elif [[ "$TOPIC" == *".events.v1" ]]; then
            create_topic "$TOPIC" "7776000000" "compact" true
            create_dlq_topic "$TOPIC"
        else
            error "Unknown topic type: $TOPIC"
            exit 1
        fi
    else
        create_all_topics
    fi
    
    info "Done!"
}

# Run main function
main

