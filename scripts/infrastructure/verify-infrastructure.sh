#!/bin/bash

# Infrastructure Verification Script
# Verifies Kafka and Schema Registry setup

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENV="${ENV:-development}"
BROKER="${BROKER:-localhost:9092}"
SCHEMA_REGISTRY_URL="${SCHEMA_REGISTRY_URL:-http://localhost:8081}"

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

# Function to check Kafka connectivity
check_kafka() {
    info "Checking Kafka connectivity..."
    
    if command -v kafka-topics &> /dev/null; then
        if kafka-topics --bootstrap-server "$BROKER" --list &> /dev/null; then
            info "✓ Kafka is accessible"
            return 0
        else
            error "✗ Cannot connect to Kafka at $BROKER"
            return 1
        fi
    else
        warn "kafka-topics command not found. Skipping Kafka check."
        return 0
    fi
}

# Function to check topics exist
check_topics() {
    info "Checking topics..."
    
    local topics=(
        "escrow.commands.v1"
        "escrow.events.v1"
        "payments.commands.v1"
        "payments.events.v1"
        "webhook.events.v1"
        "contracts.events.v1"
    )
    
    local missing_topics=()
    
    for topic in "${topics[@]}"; do
        if kafka-topics --bootstrap-server "$BROKER" --list 2>/dev/null | grep -q "^${topic}$"; then
            info "✓ Topic exists: $topic"
        else
            error "✗ Topic missing: $topic"
            missing_topics+=("$topic")
        fi
    done
    
    # Check DLQ topics
    for topic in "${topics[@]}"; do
        local dlq_topic="${topic}.dlq"
        if kafka-topics --bootstrap-server "$BROKER" --list 2>/dev/null | grep -q "^${dlq_topic}$"; then
            info "✓ DLQ topic exists: $dlq_topic"
        else
            error "✗ DLQ topic missing: $dlq_topic"
            missing_topics+=("$dlq_topic")
        fi
    done
    
    if [[ ${#missing_topics[@]} -gt 0 ]]; then
        warn "Missing topics: ${missing_topics[*]}"
        return 1
    fi
    
    return 0
}

# Function to check Schema Registry connectivity
check_schema_registry() {
    info "Checking Schema Registry connectivity..."
    
    if command -v curl &> /dev/null; then
        if curl -s -f "$SCHEMA_REGISTRY_URL/subjects" > /dev/null 2>&1; then
            info "✓ Schema Registry is accessible"
            return 0
        else
            error "✗ Cannot connect to Schema Registry at $SCHEMA_REGISTRY_URL"
            return 1
        fi
    else
        warn "curl command not found. Skipping Schema Registry check."
        return 0
    fi
}

# Function to check schemas are registered
check_schemas() {
    info "Checking registered schemas..."
    
    local subjects=(
        "escrow.commands.v1-value"
        "escrow.events.v1-value"
        "payments.commands.v1-value"
        "payments.events.v1-value"
        "webhook.events.v1-value"
        "contracts.events.v1-value"
    )
    
    local registered_subjects
    registered_subjects=$(curl -s "$SCHEMA_REGISTRY_URL/subjects" 2>/dev/null || echo "[]")
    
    local missing_schemas=()
    
    for subject in "${subjects[@]}"; do
        if echo "$registered_subjects" | grep -q "$subject"; then
            info "✓ Schema registered: $subject"
        else
            warn "✗ Schema not registered: $subject"
            missing_schemas+=("$subject")
        fi
    done
    
    if [[ ${#missing_schemas[@]} -gt 0 ]]; then
        warn "Missing schemas: ${missing_schemas[*]}"
        return 1
    fi
    
    return 0
}

# Function to get topic details
show_topic_details() {
    local topic=$1
    info "Topic details for $topic:"
    
    local details
    details=$(kafka-topics --bootstrap-server "$BROKER" --describe --topic "$topic" 2>/dev/null)
    
    if [[ -n "$details" ]]; then
        echo "$details" | grep -E "PartitionCount|ReplicationFactor|Configs" | sed 's/^/  /'
    else
        warn "Could not retrieve topic details"
    fi
}

# Main verification function
main() {
    info "Verifying infrastructure setup for environment: $ENV"
    info "Kafka Broker: $BROKER"
    info "Schema Registry: $SCHEMA_REGISTRY_URL"
    echo ""
    
    local errors=0
    
    # Check Kafka
    if ! check_kafka; then
        ((errors++))
    fi
    
    # Check topics
    if check_kafka; then
        if ! check_topics; then
            ((errors++))
        fi
    fi
    
    echo ""
    
    # Check Schema Registry
    if ! check_schema_registry; then
        ((errors++))
    fi
    
    # Check schemas
    if check_schema_registry; then
        if ! check_schemas; then
            ((errors++))
        fi
    fi
    
    echo ""
    
    # Summary
    if [[ $errors -eq 0 ]]; then
        info "✓ All checks passed!"
        return 0
    else
        error "✗ $errors check(s) failed"
        return 1
    fi
}

# Run main function
main

