#!/bin/bash

# Schema Registry Setup Script
# Initializes Schema Registry and registers Protobuf schemas for the Bloxtr8 escrow system

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
ENV="${ENV:-development}"
SCHEMA_REGISTRY_URL="${SCHEMA_REGISTRY_URL:-http://localhost:8081}"
SCHEMA_DIR="${SCHEMA_DIR:-$(dirname "$0")/../../packages/protobuf-schemas/schemas}"
DRY_RUN=false

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

Sets up Schema Registry and registers Protobuf schemas for the Bloxtr8 escrow system.

OPTIONS:
    --env ENV                   Environment (development|production) [default: development]
    --schema-registry-url URL   Schema Registry URL [default: http://localhost:8081]
    --schema-dir DIR            Directory containing Protobuf schema files [default: packages/protobuf-schemas/schemas]
    --dry-run                   Show what would be registered without registering
    --help                      Show this help message

EXAMPLES:
    # Setup for development
    $0 --env development

    # Setup for production
    $0 --env production --schema-registry-url http://schema-registry:8081

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
        --schema-registry-url)
            SCHEMA_REGISTRY_URL="$2"
            shift 2
            ;;
        --schema-dir)
            SCHEMA_DIR="$2"
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

# Function to check Schema Registry connectivity
check_schema_registry_connectivity() {
    info "Checking Schema Registry connectivity to $SCHEMA_REGISTRY_URL..."
    
    if command -v curl &> /dev/null; then
        if curl -s -f "$SCHEMA_REGISTRY_URL/subjects" > /dev/null 2>&1; then
            info "Schema Registry is accessible"
            return 0
        else
            error "Cannot connect to Schema Registry at $SCHEMA_REGISTRY_URL"
            return 1
        fi
    else
        warn "curl command not found. Skipping connectivity check."
        return 0
    fi
}

# Function to check if subject exists
subject_exists() {
    local subject=$1
    curl -s -f "$SCHEMA_REGISTRY_URL/subjects/$subject" > /dev/null 2>&1 || return 1
}

# Function to get latest schema version
get_latest_version() {
    local subject=$1
    curl -s "$SCHEMA_REGISTRY_URL/subjects/$subject/versions/latest" 2>/dev/null | jq -r '.version' 2>/dev/null || echo "0"
}

# Function to encode Protobuf schema for JSON (escape special characters)
encode_protobuf_schema() {
    local schema_file=$1
    if [[ -f "$schema_file" ]]; then
        # For Protobuf, Schema Registry expects the schema as plain text (not base64)
        # We need to escape it for JSON
        cat "$schema_file" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g'
    else
        error "Schema file not found: $schema_file"
        return 1
    fi
}

# Function to register schema
register_schema() {
    local subject=$1
    local schema_file=$2
    local compatibility_mode=${3:-BACKWARD}
    
    # Check if schema file exists
    if [[ ! -f "$schema_file" ]]; then
        error "Schema file not found: $schema_file"
        return 1
    fi
    
    # Encode schema (escape for JSON)
    local encoded_schema
    encoded_schema=$(encode_protobuf_schema "$schema_file")
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would register schema:"
        info "  Subject: $subject"
        info "  Schema File: $schema_file"
        info "  Compatibility: $compatibility_mode"
        return 0
    fi
    
    info "Registering schema for subject: $subject"
    
    # Register schema using jq to properly construct JSON
    local response
    if command -v jq >/dev/null 2>&1; then
        local json_payload
        json_payload=$(jq -n \
            --arg schemaType "PROTOBUF" \
            --arg schema "$encoded_schema" \
            '{schemaType: $schemaType, schema: $schema}')
        response=$(curl -s -X POST "$SCHEMA_REGISTRY_URL/subjects/$subject/versions" \
            -H "Content-Type: application/vnd.schemaregistry.v1+json" \
            -d "$json_payload" 2>&1)
    else
        # Fallback to manual JSON construction if jq not available
        response=$(curl -s -X POST "$SCHEMA_REGISTRY_URL/subjects/$subject/versions" \
            -H "Content-Type: application/vnd.schemaregistry.v1+json" \
            -d "{
            \"schemaType\": \"PROTOBUF\",
            \"schema\": \"$encoded_schema\"
        }" 2>&1)
    fi
    
    if [[ $? -eq 0 ]]; then
        local schema_id
        schema_id=$(echo "$response" | jq -r '.id' 2>/dev/null || echo "unknown")
        info "Successfully registered schema. Schema ID: $schema_id"
        
        # Set compatibility mode
        set_compatibility_mode "$subject" "$compatibility_mode"
        return 0
    else
        error "Failed to register schema: $subject"
        echo "$response" | jq -r '.message' 2>/dev/null || echo "$response"
        return 1
    fi
}

# Function to set compatibility mode
set_compatibility_mode() {
    local subject=$1
    local compatibility_mode=$2
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would set compatibility mode for $subject to $compatibility_mode"
        return 0
    fi
    
    info "Setting compatibility mode for $subject to $compatibility_mode"
    
    local response
    response=$(curl -s -X PUT "$SCHEMA_REGISTRY_URL/config/$subject" \
        -H "Content-Type: application/vnd.schemaregistry.v1+json" \
        -d "{\"compatibility\": \"$compatibility_mode\"}" 2>&1)
    
    if [[ $? -eq 0 ]]; then
        info "Compatibility mode set successfully"
        return 0
    else
        warn "Failed to set compatibility mode (may already be set)"
        return 0
    fi
}

# Function to set global compatibility mode
set_global_compatibility_mode() {
    local compatibility_mode=${1:-BACKWARD}
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would set global compatibility mode to $compatibility_mode"
        return 0
    fi
    
    info "Setting global compatibility mode to $compatibility_mode"
    
    curl -s -X PUT "$SCHEMA_REGISTRY_URL/config" \
        -H "Content-Type: application/vnd.schemaregistry.v1+json" \
        -d "{\"compatibility\": \"$compatibility_mode\"}" > /dev/null
    
    if [[ $? -eq 0 ]]; then
        info "Global compatibility mode set successfully"
    else
        warn "Failed to set global compatibility mode"
    fi
}

# Function to verify schema registration
verify_schema() {
    local subject=$1
    
    if [[ "$DRY_RUN" == true ]]; then
        return 0
    fi
    
    if subject_exists "$subject"; then
        info "Verified schema exists: $subject"
        
        # Get schema details
        local version
        version=$(get_latest_version "$subject")
        info "  Latest version: $version"
        
        # Get compatibility mode
        local compat
        compat=$(curl -s "$SCHEMA_REGISTRY_URL/config/$subject" 2>/dev/null | \
            jq -r '.compatibilityLevel' 2>/dev/null || echo "unknown")
        info "  Compatibility: $compat"
        
        return 0
    else
        error "Schema verification failed: $subject"
        return 1
    fi
}

# Function to register all schemas
register_all_schemas() {
    info "Registering Protobuf schemas for environment: $ENV"
    info "Schema Registry URL: $SCHEMA_REGISTRY_URL"
    info "Schema Directory: $SCHEMA_DIR"
    echo ""
    
    # Check if schema directory exists
    if [[ ! -d "$SCHEMA_DIR" ]]; then
        warn "Schema directory not found: $SCHEMA_DIR"
        warn "Creating placeholder schema directory structure..."
        mkdir -p "$SCHEMA_DIR"
        return 0
    fi
    
    # Set global compatibility mode
    set_global_compatibility_mode "BACKWARD"
    echo ""
    
    # Define schema mappings
    # Format: subject:schema_file:compatibility_mode
    local schemas=(
        # Escrow commands
        "escrow.commands.v1-value:escrow-commands.proto:BACKWARD"
        
        # Escrow events
        "escrow.events.v1-value:escrow-events.proto:BACKWARD"
        
        # Payment commands
        "payments.commands.v1-value:payments-commands.proto:BACKWARD"
        
        # Payment events
        "payments.events.v1-value:payments-events.proto:BACKWARD"
        
        # Webhook events
        "webhook.events.v1-value:webhook-events.proto:BACKWARD"
        
        # Contract events
        "contracts.events.v1-value:contracts-events.proto:BACKWARD"
    )
    
    local failed_schemas=()
    
    # Register schemas
    for schema_config in "${schemas[@]}"; do
        IFS=':' read -r subject schema_file compatibility_mode <<< "$schema_config"
        local full_schema_path="${SCHEMA_DIR}/${schema_file}"
        
        # Skip if schema file doesn't exist
        if [[ ! -f "$full_schema_path" ]]; then
            warn "Schema file not found: $full_schema_path. Skipping."
            continue
        fi
        
        # Register schema
        if ! register_schema "$subject" "$full_schema_path" "$compatibility_mode"; then
            failed_schemas+=("$subject")
            continue
        fi
        
        # Verify schema
        verify_schema "$subject"
        echo ""
    done
    
    # Summary
    echo ""
    info "Schema registration summary:"
    if [[ ${#failed_schemas[@]} -eq 0 ]]; then
        info "All schemas registered successfully!"
    else
        error "Failed to register the following schemas:"
        for schema in "${failed_schemas[@]}"; do
            error "  - $schema"
        done
        exit 1
    fi
}

# Function to list all subjects
list_subjects() {
    info "Listing all registered subjects:"
    
    if [[ "$DRY_RUN" == true ]]; then
        info "[DRY RUN] Would list subjects"
        return 0
    fi
    
    local subjects
    subjects=$(curl -s "$SCHEMA_REGISTRY_URL/subjects" 2>/dev/null)
    
    if [[ -n "$subjects" ]]; then
        echo "$subjects" | jq -r '.[]' 2>/dev/null || echo "$subjects"
    else
        warn "No subjects found"
    fi
}

# Main execution
main() {
    # Check Schema Registry connectivity
    if ! check_schema_registry_connectivity; then
        if [[ "$DRY_RUN" == false ]]; then
            error "Cannot proceed without Schema Registry connectivity"
            exit 1
        fi
    fi
    
    # Register schemas
    register_all_schemas
    
    # List subjects
    echo ""
    list_subjects
    
    info "Done!"
}

# Run main function
main

