#!/bin/bash
# Development setup script for Bloxtr8
# This script starts the database in Docker and runs API, bot, and web on host

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

# Start database and MinIO services
print_status "Starting database and MinIO services in Docker..."
docker compose up -d test-db minio

# Wait for database to be ready
print_status "Waiting for database to be ready..."
sleep 5

# Check if database is accessible
for i in {1..30}; do
    if docker compose exec -T test-db pg_isready -U postgres > /dev/null 2>&1; then
        print_success "Database is ready!"
        break
    fi
    if [ $i -eq 30 ]; then
        print_error "Database failed to start. Check Docker logs."
        exit 1
    fi
    sleep 2
done

# Generate Prisma client and push schema
print_status "Setting up database schema..."
pnpm db:generate
pnpm db:push

print_success "Database setup complete!"

# Start all services
print_status "Starting all services..."

# Function to start service in background
start_service() {
    local service_name=$1
    local filter=$2
    local port=$3
    
    print_status "Starting $service_name on port $port..."
    pnpm --filter=$filter dev &
    local pid=$!
    echo $pid > ".${service_name}.pid"
    
    # Wait a moment for service to start
    sleep 3
    
    # Check if service is running
    if kill -0 $pid 2>/dev/null; then
        print_success "$service_name is running (PID: $pid)"
    else
        print_error "Failed to start $service_name"
        return 1
    fi
}

# Start services
start_service "api" "@bloxtr8/api" "3000"
start_service "escrow" "@bloxtr8/escrow" "3001"
start_service "discord-bot" "@bloxtr8/discord-bot" "discord"
start_service "web-app" "web-app" "5173"

# Wait a moment for all services to start
sleep 5

# Check service status
print_status "Checking service status..."

# Check API
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    print_success "API server is healthy at http://localhost:3000"
else
    print_warning "API server may not be ready yet at http://localhost:3000"
fi
# Check Escrow
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    print_success "Escrow server is healthy at http://localhost:3001"
else
    print_warning "Escrow server may not be ready yet at http://localhost:3001"
fi

# Check Web App
if curl -s http://localhost:5173 > /dev/null 2>&1; then
    print_success "Web app is ready at http://localhost:5173"
else
    print_warning "Web app may not be ready yet at http://localhost:5173"
fi

# Check Discord Bot
if ps aux | grep -E "discord.*bot" | grep -v grep > /dev/null 2>&1; then
    print_success "Discord bot is running"
else
    print_warning "Discord bot may not be ready yet"
fi

echo ""
echo "🎉 Development Environment Ready!"
echo "================================="
echo "📊 API Server:     http://localhost:3000"
echo "🌐 Web App:        http://localhost:5173"
echo "🏦 Escrow:         http://localhost:3001"
echo "🤖 Discord Bot:    Running in background"
echo "🗄️  Database:      localhost:5432"
echo "📁 MinIO Console:  http://localhost:9001 (admin/minioadmin123)"
echo ""
echo "📝 To stop all services, run: pnpm dev:hoang:stop"
echo "📊 To view logs, run: pnpm dev:hoang:logs"
echo ""
echo "Happy coding! 🚀"
