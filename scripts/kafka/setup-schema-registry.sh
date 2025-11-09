#!/usr/bin/env bash

# Schema Registry Setup Script
# Installs and configures Confluent Schema Registry for managing Protobuf schemas with backward compatibility.

set -euo pipefail

ENVIRONMENT="${ENV:-development}"
SCHEMA_REGISTRY_URL="${SCHEMA_REGISTRY_URL:-http://localhost:8081}"
SCHEMA_DIR="${SCHEMA_DIR:-$(dirname "$0")/../../packages/protobuf-schemas/schemas}"
DRY_RUN=false
DOCKER_SERVICE="${DOCKER_SERVICE:-schema-registry}"
USE_DOCKER=false

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

Install and configure Confluent Schema Registry for managing Protobuf schemas with backward compatibility.

Options:
  --env ENV                 Environment (development|production). Defaults to env var ENV or "development".
  --schema-registry-url URL Schema Registry URL [default: http://localhost:8081]
  --schema-dir DIR          Directory containing Protobuf schema files [default: packages/protobuf-schemas/schemas]
  --dry-run                 Print actions without executing.
  --docker-service NAME     Docker Compose service to exec commands in (default: schema-registry).
  --help                    Show this help text.

Examples:
  $0 --env development
  $0 --env production --schema-registry-url http://schema-registry:8081
  $0 --dry-run
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      ENVIRONMENT="$2"
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

# Determine if we should run curl via Docker
if ! command -v curl >/dev/null 2>&1; then
  if docker compose ps "$DOCKER_SERVICE" 2>/dev/null | grep -qE "Up|healthy"; then
    USE_DOCKER=true
  else
    warn "curl command not found and Docker service '$DOCKER_SERVICE' unavailable. Commands may fail."
  fi
fi

run_curl() {
  if [[ "$USE_DOCKER" == true ]]; then
    docker compose exec -T "$DOCKER_SERVICE" curl "$@"
  else
    curl "$@"
  fi
}

check_schema_registry_connectivity() {
  info "Validating connectivity to Schema Registry: $SCHEMA_REGISTRY_URL"
  if [[ "$DRY_RUN" == true ]]; then
    warn "Skipping connectivity check in dry-run mode."
    return 0
  fi

  if run_curl -s -f "$SCHEMA_REGISTRY_URL/subjects" >/dev/null 2>&1; then
    info "Schema Registry connection successful."
    return 0
  fi

  error "Unable to reach Schema Registry at $SCHEMA_REGISTRY_URL"
  return 1
}

subject_exists() {
  local subject="$1"
  run_curl -s -f "$SCHEMA_REGISTRY_URL/subjects/$subject" >/dev/null 2>&1
}

get_latest_version() {
  local subject="$1"
  run_curl -s "$SCHEMA_REGISTRY_URL/subjects/$subject/versions/latest" 2>/dev/null | \
    grep -o '"version":[0-9]*' | cut -d':' -f2 || echo "0"
}

# Function to read Protobuf schema content (raw, no escaping)
read_protobuf_schema() {
  local schema_file="$1"
  if [[ -f "$schema_file" ]]; then
    cat "$schema_file"
  else
    error "Schema file not found: $schema_file"
    return 1
  fi
}

# Function to encode Protobuf schema for JSON (escape special characters)
# Only used when jq is not available (fallback path)
encode_protobuf_schema() {
  local schema_file="$1"
  if [[ -f "$schema_file" ]]; then
    # For Protobuf, Schema Registry expects the schema as plain text (not base64)
    # We need to escape it for JSON (only for manual JSON construction)
    cat "$schema_file" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed ':a;N;$!ba;s/\n/\\n/g'
  else
    error "Schema file not found: $schema_file"
    return 1
  fi
}

# Schema validation rules
validate_protobuf_schema() {
  local schema_file="$1"
  
  if [[ ! -f "$schema_file" ]]; then
    error "Schema file does not exist: $schema_file"
    return 1
  fi

  # Check if file is readable
  if [[ ! -r "$schema_file" ]]; then
    error "Schema file is not readable: $schema_file"
    return 1
  fi

  # Basic Protobuf syntax validation
  # Check for proto3 or proto2 syntax declaration
  if ! grep -qE "^syntax\s*=\s*[\"']proto[23][\"']" "$schema_file"; then
    warn "Schema file may not have valid Protobuf syntax declaration: $schema_file"
    warn "Expected: syntax = \"proto3\"; or syntax = \"proto2\";"
  fi

  # Check for package declaration (recommended)
  if ! grep -qE "^package\s+" "$schema_file"; then
    warn "Schema file does not have a package declaration: $schema_file"
  fi

  # Check for at least one message definition
  if ! grep -qE "^message\s+\w+" "$schema_file"; then
    error "Schema file does not contain any message definitions: $schema_file"
    return 1
  fi

  # Check file is not empty
  if [[ ! -s "$schema_file" ]]; then
    error "Schema file is empty: $schema_file"
    return 1
  fi

  return 0
}

check_compatibility() {
  local subject="$1"
  local schema_file="$2"
  
  if [[ "$DRY_RUN" == true ]]; then
    return 0
  fi

  if ! subject_exists "$subject"; then
    # First version, always compatible
    return 0
  fi

  # Test compatibility with latest version using jq
  local response
  if command -v jq >/dev/null 2>&1; then
    # Read raw schema content - jq will handle JSON escaping via --arg
    local raw_schema
    raw_schema=$(read_protobuf_schema "$schema_file")
    local json_payload
    json_payload=$(jq -n \
      --arg schemaType "PROTOBUF" \
      --arg schema "$raw_schema" \
      '{schemaType: $schemaType, schema: $schema}')
    response=$(run_curl -s -X POST "$SCHEMA_REGISTRY_URL/compatibility/subjects/$subject/versions/latest" \
      -H "Content-Type: application/vnd.schemaregistry.v1+json" \
      -d "$json_payload" 2>&1)
  else
    # Fallback to manual JSON construction
    # Need to escape manually in this case
    local encoded_schema
    encoded_schema=$(encode_protobuf_schema "$schema_file")
    response=$(run_curl -s -X POST "$SCHEMA_REGISTRY_URL/compatibility/subjects/$subject/versions/latest" \
      -H "Content-Type: application/vnd.schemaregistry.v1+json" \
      -d "{
      \"schemaType\": \"PROTOBUF\",
      \"schema\": \"$encoded_schema\"
    }" 2>&1)
  fi

  if echo "$response" | grep -q '"is_compatible":true'; then
    return 0
  elif echo "$response" | grep -q '"is_compatible":false'; then
    error "Schema is not backward compatible with existing version"
    return 1
  else
    warn "Could not verify compatibility (may be first version)"
    return 0
  fi
}

set_global_compatibility_mode() {
  local compatibility_mode="${1:-BACKWARD}"
  
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would set global compatibility mode to $compatibility_mode"
    return 0
  fi

  info "Setting global compatibility mode to $compatibility_mode"
  
  local response
  response=$(run_curl -s -X PUT "$SCHEMA_REGISTRY_URL/config" \
    -H "Content-Type: application/vnd.schemaregistry.v1+json" \
    -d "{\"compatibility\": \"$compatibility_mode\"}" 2>&1)

  if echo "$response" | grep -q '"compatibilityLevel"'; then
    info "Global compatibility mode set successfully to $compatibility_mode"
    return 0
  else
    warn "Failed to set global compatibility mode (may already be set)"
    echo "$response" | jq -r '.message' 2>/dev/null || echo "$response"
    return 0
  fi
}

set_subject_compatibility_mode() {
  local subject="$1"
  local compatibility_mode="${2:-BACKWARD}"
  
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would set compatibility mode for $subject to $compatibility_mode"
    return 0
  fi

  info "Setting compatibility mode for $subject to $compatibility_mode"
  
  local response
  response=$(run_curl -s -X PUT "$SCHEMA_REGISTRY_URL/config/$subject" \
    -H "Content-Type: application/vnd.schemaregistry.v1+json" \
    -d "{\"compatibility\": \"$compatibility_mode\"}" 2>&1)

  if echo "$response" | grep -q '"compatibilityLevel"'; then
    info "Compatibility mode set successfully for $subject"
    return 0
  else
    warn "Failed to set compatibility mode for $subject (may already be set)"
    return 0
  fi
}

register_schema() {
  local subject="$1"
  local schema_file="$2"
  local compatibility_mode="${3:-BACKWARD}"
  
  # Validate schema before registration
  if ! validate_protobuf_schema "$schema_file"; then
    error "Schema validation failed for $schema_file"
    return 1
  fi

  # Check compatibility before registration
  if ! check_compatibility "$subject" "$schema_file"; then
    error "Compatibility check failed for $subject"
    return 1
  fi
  
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
    # Read raw schema content - jq will handle JSON escaping via --arg
    local raw_schema
    raw_schema=$(read_protobuf_schema "$schema_file")
    local json_payload
    json_payload=$(jq -n \
      --arg schemaType "PROTOBUF" \
      --arg schema "$raw_schema" \
      '{schemaType: $schemaType, schema: $schema}')
    response=$(run_curl -s -X POST "$SCHEMA_REGISTRY_URL/subjects/$subject/versions" \
      -H "Content-Type: application/vnd.schemaregistry.v1+json" \
      -d "$json_payload" 2>&1)
  else
    # Fallback to manual JSON construction if jq not available
    # Need to escape manually in this case
    local encoded_schema
    encoded_schema=$(encode_protobuf_schema "$schema_file")
    response=$(run_curl -s -X POST "$SCHEMA_REGISTRY_URL/subjects/$subject/versions" \
      -H "Content-Type: application/vnd.schemaregistry.v1+json" \
      -d "{
      \"schemaType\": \"PROTOBUF\",
      \"schema\": \"$encoded_schema\"
    }" 2>&1)
  fi
  
  if echo "$response" | grep -q '"id"'; then
    local schema_id
    schema_id=$(echo "$response" | grep -o '"id":[0-9]*' | cut -d':' -f2 || echo "unknown")
    info "Successfully registered schema. Schema ID: $schema_id"
    
    # Set per-subject compatibility mode
    set_subject_compatibility_mode "$subject" "$compatibility_mode"
    return 0
  else
    error "Failed to register schema: $subject"
    echo "$response" | grep -o '"message":"[^"]*"' | cut -d'"' -f4 2>/dev/null || echo "$response"
    return 1
  fi
}

verify_schema() {
  local subject="$1"
  
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
    local compat_response
    compat_response=$(run_curl -s "$SCHEMA_REGISTRY_URL/config/$subject" 2>/dev/null)
    local compat
    compat=$(echo "$compat_response" | grep -o '"compatibilityLevel":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
    info "  Compatibility: $compat"
    
    return 0
  else
    error "Schema verification failed: $subject"
    return 1
  fi
}

register_all_schemas() {
  info "Registering Protobuf schemas for environment: $ENVIRONMENT"
  info "Schema Registry URL: $SCHEMA_REGISTRY_URL"
  info "Schema Directory: $SCHEMA_DIR"
  echo ""
  
  # Check if schema directory exists
  if [[ ! -d "$SCHEMA_DIR" ]]; then
    warn "Schema directory not found: $SCHEMA_DIR"
    warn "Creating placeholder schema directory structure..."
    mkdir -p "$SCHEMA_DIR"
    info "Schema directory created. Please add Protobuf schema files (.proto) to $SCHEMA_DIR"
    return 0
  fi
  
  # Set global compatibility mode
  set_global_compatibility_mode "BACKWARD"
  echo ""
  
  # Define schema mappings
  # Format: subject:schema_file:compatibility_mode
  local schemas=(
    "escrow.commands.v1-value:escrow-commands.proto:BACKWARD"
    "escrow.events.v1-value:escrow-events.proto:BACKWARD"
    "payments.commands.v1-value:payments-commands.proto:BACKWARD"
    "payments.events.v1-value:payments-events.proto:BACKWARD"
    "webhook.events.v1-value:webhook-events.proto:BACKWARD"
    "contracts.events.v1-value:contracts-events.proto:BACKWARD"
  )
  
  local failed_schemas=()
  local registered_count=0
  
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
    if register_schema "$subject" "$full_schema_path" "$compatibility_mode"; then
      registered_count=$((registered_count + 1))
      # Verify schema
      verify_schema "$subject"
      echo ""
    else
      failed_schemas+=("$subject")
      continue
    fi
  done
  
  # Summary
  echo ""
  info "Schema registration summary:"
  info "  Registered: $registered_count schemas"
  if [[ ${#failed_schemas[@]} -eq 0 ]]; then
    if [[ $registered_count -gt 0 ]]; then
      info "All schemas registered successfully!"
    else
      warn "No schemas were registered (schema files may not exist)"
    fi
  else
    error "Failed to register the following schemas:"
    for schema in "${failed_schemas[@]}"; do
      error "  - $schema"
    done
    exit 1
  fi
}

list_subjects() {
  info "Listing all registered subjects:"
  
  if [[ "$DRY_RUN" == true ]]; then
    info "[DRY RUN] Would list subjects"
    return 0
  fi
  
  local subjects
  subjects=$(run_curl -s "$SCHEMA_REGISTRY_URL/subjects" 2>/dev/null)
  
  if [[ -n "$subjects" ]]; then
    if command -v jq >/dev/null 2>&1; then
      echo "$subjects" | jq -r '.[]' 2>/dev/null || echo "$subjects"
    else
      echo "$subjects"
    fi
  else
    warn "No subjects found"
  fi
}

main() {
  info "Environment: $ENVIRONMENT"
  info "Schema Registry URL: $SCHEMA_REGISTRY_URL"
  if [[ "$USE_DOCKER" == true ]]; then
    info "Executing curl via Docker service: $DOCKER_SERVICE"
  fi
  echo ""
  
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

main "$@"

