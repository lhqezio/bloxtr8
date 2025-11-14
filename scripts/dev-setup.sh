#!/bin/bash
# Development setup script for Bloxtr8
# Starts Docker services and application services on host

set -e

echo "🚀 Starting Bloxtr8 Development Environment"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Aggressive cleanup at the very start - kill any existing processes
print_status "Performing initial cleanup of existing processes..."
pkill -9 -f "tsx watch.*@bloxtr8/api" 2>/dev/null || true
pkill -9 -f "tsx watch.*apps/api" 2>/dev/null || true
pkill -9 -f "tsx watch.*discord-bot" 2>/dev/null || true
pkill -9 -f "tsx watch.*apps/discord-bot" 2>/dev/null || true
pkill -9 -f "tsx watch.*escrow-service" 2>/dev/null || true
pkill -9 -f "tsx watch.*apps/escrow-service" 2>/dev/null || true
pkill -9 -f "discord-bot" 2>/dev/null || true
pkill -9 -f "vite.*5173" 2>/dev/null || true
# Kill any processes on our ports
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
sleep 1

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_warning "Docker is not running. Starting Docker..."
    open -a Docker
    print_status "Waiting for Docker to start..."
    sleep 10
    
    # Wait for Docker to be ready
    for i in {1..30}; do
        if docker info > /dev/null 2>&1; then
            print_success "Docker is now running!"
            break
        fi
        if [ $i -eq 30 ]; then
            print_error "Docker failed to start. Please start Docker manually and try again."
            exit 1
        fi
        sleep 2
    done
fi

# Set up environment
print_status "Setting up environment variables..."
./scripts/env-dev.sh

# Override DATABASE_URL to use local Docker database
LOCAL_DB_URL="postgresql://postgres:postgres@localhost:5432/bloxtr8-db"

# Detect OS for sed -i portability (macOS requires an explicit empty backup suffix)
sed_in_place() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

update_env_file() {
    local file=$1
    [ -f "$file" ] || return 0
    
    if grep -q "^DATABASE_URL=" "$file"; then
        sed_in_place "s|^DATABASE_URL=.*|DATABASE_URL=\"$LOCAL_DB_URL\"|" "$file"
    else
        echo "DATABASE_URL=\"$LOCAL_DB_URL\"" >> "$file"
    fi
    
    if grep -q "^DATABASE_URL_PRISMA=" "$file"; then
        sed_in_place "s|^DATABASE_URL_PRISMA=.*|DATABASE_URL_PRISMA=\"$LOCAL_DB_URL\"|" "$file"
    else
        echo "DATABASE_URL_PRISMA=\"$LOCAL_DB_URL\"" >> "$file"
    fi
}

if [ -f ".env" ]; then
    update_env_file ".env"
    update_env_file "apps/api/.env"
    update_env_file "apps/discord-bot/.env"
    update_env_file "apps/escrow-service/.env"
    print_status "Updated DATABASE_URL to use local Docker database"
fi

# Start Docker services
print_status "Starting Docker services..."
# Try to start Kafka services (kafka-1, kafka-2, kafka-3, or fallback to kafka)
KAFKA_SERVICES=""
for kafka_svc in kafka-1 kafka-2 kafka-3 kafka; do
    if docker compose config --services 2>/dev/null | grep -q "^${kafka_svc}$"; then
        KAFKA_SERVICES="${KAFKA_SERVICES} ${kafka_svc}"
    fi
done
# Remove leading space and use kafka as fallback if none found
KAFKA_SERVICES=${KAFKA_SERVICES:-kafka}
docker compose up -d test-db minio ${KAFKA_SERVICES} schema-registry

# Wait for database
print_status "Waiting for database..."
sleep 5
for i in {1..30}; do
    if docker compose exec -T test-db pg_isready -U postgres > /dev/null 2>&1; then
        print_success "Database is ready!"
        break
    fi
    [ $i -eq 30 ] && print_error "Database failed to start. Check Docker logs." && exit 1
    sleep 2
done

# Generate Prisma client and push schema
print_status "Setting up database schema..."
pnpm db:generate
pnpm db:push
print_success "Database setup complete!"

# Wait for Kafka
print_status "Waiting for Kafka cluster to form quorum..."
KAFKA_READY=false
KAFKA_SERVICES_LIST=()
# Find all Kafka services in the compose config (kafka-1, kafka-2, kafka-3, or fallback to kafka)
for kafka_svc in kafka-1 kafka-2 kafka-3 kafka; do
    if docker compose config --services 2>/dev/null | grep -q "^${kafka_svc}$"; then
        KAFKA_SERVICES_LIST+=("$kafka_svc")
    fi
done

if [ ${#KAFKA_SERVICES_LIST[@]} -eq 0 ]; then
    print_error "No Kafka service found in docker-compose.yml. Expected one of: kafka-1, kafka-2, kafka-3, or kafka"
    exit 1
fi

# For multi-broker KRaft clusters, we need a quorum (majority) before topic creation
# Quorum = ceil((n + 1) / 2) where n is the number of brokers
# For 1 broker: need 1, for 2 brokers: need 2, for 3 brokers: need 2
NUM_BROKERS=${#KAFKA_SERVICES_LIST[@]}
if [ $NUM_BROKERS -eq 1 ]; then
    REQUIRED_HEALTHY=1
else
    # Calculate majority: (n + 1) / 2 rounded up
    REQUIRED_HEALTHY=$(( (NUM_BROKERS + 1) / 2 ))
    # For even numbers, we need n/2 + 1 (e.g., 2 brokers need 2, not 1)
    if [ $((NUM_BROKERS % 2)) -eq 0 ]; then
        REQUIRED_HEALTHY=$((NUM_BROKERS / 2 + 1))
    fi
fi

print_status "Detected ${#KAFKA_SERVICES_LIST[@]} Kafka broker(s). Waiting for $REQUIRED_HEALTHY to be healthy (quorum required for KRaft cluster)..."

for i in {1..60}; do
    HEALTHY_COUNT=0
    
    for kafka_svc in "${KAFKA_SERVICES_LIST[@]}"; do
        if docker compose ps "$kafka_svc" 2>/dev/null | grep -q "healthy\|Up"; then
            # Test connectivity to this broker (using internal port 9092)
            if docker compose exec -T "$kafka_svc" kafka-broker-api-versions --bootstrap-server localhost:9092 > /dev/null 2>&1; then
                HEALTHY_COUNT=$((HEALTHY_COUNT + 1))
            fi
        fi
    done
    
    if [ $HEALTHY_COUNT -ge $REQUIRED_HEALTHY ]; then
        print_success "Kafka cluster quorum formed! $HEALTHY_COUNT of ${#KAFKA_SERVICES_LIST[@]} broker(s) healthy."
        KAFKA_READY=true
        break
    fi
    
    if [ $i -eq 60 ]; then
        print_error "Kafka cluster failed to form quorum. Only $HEALTHY_COUNT of ${#KAFKA_SERVICES_LIST[@]} broker(s) healthy (need $REQUIRED_HEALTHY)."
        print_error "Check logs: docker compose logs ${KAFKA_SERVICES_LIST[*]}"
        exit 1
    fi
    
    if [ $((i % 5)) -eq 0 ]; then
        print_status "Waiting for Kafka quorum... ($HEALTHY_COUNT/${#KAFKA_SERVICES_LIST[@]} brokers healthy, need $REQUIRED_HEALTHY)"
    fi
    sleep 2
done

# Create Kafka topics
if [ "$KAFKA_READY" = true ] && [ -f "./scripts/infrastructure/create-kafka-topics.sh" ]; then
    print_status "Creating Kafka topics..."
    ./scripts/infrastructure/create-kafka-topics.sh --env development --broker localhost:9092,localhost:9093,localhost:9094 2>&1 && \
        print_success "Kafka topics created!" || \
        print_warning "Topic creation had issues (topics may already exist). Continuing..."
fi

# Wait for Schema Registry
print_status "Waiting for Schema Registry..."
SCHEMA_REGISTRY_READY=false
for i in {1..40}; do
    if curl -s http://localhost:8081/subjects > /dev/null 2>&1; then
        print_success "Schema Registry is ready!"
        SCHEMA_REGISTRY_READY=true
        break
    fi
    [ $i -eq 40 ] && print_warning "Schema Registry not responding. Continuing without it..."
    sleep 2
done

# Setup Schema Registry schemas
if [ "$SCHEMA_REGISTRY_READY" = true ] && [ -f "./scripts/kafka/setup-schema-registry.sh" ]; then
    print_status "Setting up Schema Registry schemas..."
    ./scripts/kafka/setup-schema-registry.sh --env development --schema-registry-url http://localhost:8081 2>&1 && \
        print_success "Schema Registry setup complete!" || \
        print_warning "Schema setup had issues (schemas may already exist). Continuing..."
fi

# Check and stop existing services
print_status "Checking for existing services..."

stop_existing_service() {
    local service_name=$1
    local port=$2
    
    # Check PID file first
    local pid_file=".${service_name}.pid"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            print_status "Stopping existing $service_name (PID: $pid)..."
            kill $pid 2>/dev/null || true
            sleep 1
            if kill -0 $pid 2>/dev/null; then
                kill -9 $pid 2>/dev/null || true
            fi
            print_success "Stopped existing $service_name"
            rm -f "$pid_file"
        else
            rm -f "$pid_file"
        fi
    fi
    
    # Check by port if specified
    if [ -n "$port" ]; then
        local pids=$(lsof -t -i :$port 2>/dev/null || true)
        if [ -n "$pids" ]; then
            print_status "Found $service_name running on port $port (PIDs: $pids), stopping..."
            for pid in $pids; do
                kill $pid 2>/dev/null || true
                sleep 1
                if kill -0 $pid 2>/dev/null; then
                    kill -9 $pid 2>/dev/null || true
                fi
            done
            print_success "Stopped $service_name on port $port"
        fi
    fi
    
    # For Discord bot, also check by process pattern (no port)
    if [ "$service_name" = "discord-bot" ]; then
        local pids=$(pgrep -f "discord-bot" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            print_status "Found $service_name processes (PIDs: $pids), stopping..."
            for pid in $pids; do
                kill $pid 2>/dev/null || true
                sleep 1
                if kill -0 $pid 2>/dev/null; then
                    kill -9 $pid 2>/dev/null || true
                fi
            done
            print_success "Stopped $service_name processes"
        fi
    fi
}

# Stop any existing services
stop_existing_service "api" "3000"
stop_existing_service "web-app" "5173"
stop_existing_service "discord-bot" ""
stop_existing_service "escrow-service" ""

# Clean up any stale processes
print_status "Cleaning up stale processes..."
pkill -f "tsx watch.*@bloxtr8/api" 2>/dev/null || true
pkill -f "tsx watch.*apps/api" 2>/dev/null || true
pkill -f "vite.*5173" 2>/dev/null || true
pkill -f "discord.*bot" 2>/dev/null || true
pkill -f "tsx watch.*discord-bot" 2>/dev/null || true
pkill -f "tsx watch.*apps/discord-bot" 2>/dev/null || true
pkill -f "tsx watch.*escrow-service" 2>/dev/null || true
pkill -f "tsx watch.*apps/escrow-service" 2>/dev/null || true

# More aggressive cleanup for Discord bot (catch any node processes running discord-bot)
if pgrep -f "discord-bot" > /dev/null 2>&1; then
    print_status "Found Discord bot processes, stopping..."
    pkill -9 -f "discord-bot" 2>/dev/null || true
    # Also catch tsx processes running discord-bot
    pkill -9 -f "tsx.*discord-bot" 2>/dev/null || true
fi

# More aggressive cleanup for escrow-service
if pgrep -f "escrow-service" > /dev/null 2>&1; then
    print_status "Found escrow-service processes, stopping..."
    pkill -9 -f "escrow-service" 2>/dev/null || true
    pkill -9 -f "tsx.*escrow-service" 2>/dev/null || true
fi

sleep 2

# Start application services
print_status "Starting application services..."

start_service() {
    local service_name=$1
    local filter=$2
    
    print_status "Starting $service_name..."
    pnpm --filter=$filter dev &
    local pid=$!
    sleep 3
    
    if kill -0 $pid 2>/dev/null; then
        print_success "$service_name is running (PID: $pid)"
    else
        print_error "Failed to start $service_name"
        return 1
    fi
}

start_service "api" "@bloxtr8/api"
start_service "discord-bot" "@bloxtr8/discord-bot"
start_service "escrow-service" "@bloxtr8/escrow-service"
start_service "web-app" "web-app"

sleep 5

# Check service health
check_health() {
    local name=$1
    local url=$2
    if curl -s "$url" > /dev/null 2>&1; then
        print_success "$name is healthy at $url"
    else
        print_warning "$name may not be ready yet at $url"
    fi
}

print_status "Checking service status..."
check_health "API server" "http://localhost:3000/health"
check_health "Web app" "http://localhost:5173"

if ps aux | grep -E "discord.*bot" | grep -v grep > /dev/null 2>&1; then
    print_success "Discord bot is running"
else
    print_warning "Discord bot may not be ready yet"
fi

if ps aux | grep -E "escrow-service" | grep -v grep > /dev/null 2>&1; then
    print_success "Escrow service is running"
else
    print_warning "Escrow service may not be ready yet"
fi

echo ""
echo "🎉 Development Environment Ready!"
echo "================================="
echo "📊 API Server:     http://localhost:3000"
echo "🌐 Web App:        http://localhost:5173"
echo "🤖 Discord Bot:    Running in background"
echo "💼 Escrow Service: Running in background"
echo "🗄️  Database:      localhost:5432"
echo "📁 MinIO Console:  http://localhost:9001 (admin/minioadmin123)"
echo "📨 Kafka:          localhost:9092"
echo "📋 Schema Registry: http://localhost:8081"
echo ""
echo "📝 To stop all services, run: pnpm dev:hoang:stop"
echo "📊 To view logs, run: pnpm dev:hoang:logs"
echo ""
echo "Happy coding! 🚀"
