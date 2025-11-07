#!/bin/bash
# Production deployment script for Bloxtr8
# This script builds and runs all services on the native host machine

set -e

echo "🚀 Starting Bloxtr8 Production Deployment"
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

# Check if Docker is running (for database)
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

# Start MinIO service
print_status "Starting MinIO service in Docker..."
docker compose up -d minio



# Build web app
print_status "Building web app..."
pnpm --filter=web-app build

# Copy web app dist to API folder for serving
print_status "Copying web app dist to API folder..."
mkdir -p apps/api/public
rm -rf apps/api/public/*
cp -r apps/web-app/dist/* apps/api/public/

print_success "Web app built and copied to API!"

# Build API server
print_status "Building API server..."
pnpm --filter=@bloxtr8/api build

print_success "API server built!"

# Build Discord bot
print_status "Building Discord bot..."
pnpm --filter=@bloxtr8/discord-bot build

print_success "Discord bot built!"

# Start all services
print_status "Starting all services..."

# Function to start service in background
start_service() {
    local service_name=$1
    local command=$2
    local port=$3
    
    print_status "Starting $service_name on port $port..."
    eval "$command" &
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

# Start API server
start_service "api" "node apps/api/dist/index.js" "3000"

# Start Discord bot
start_service "discord-bot" "node apps/discord-bot/dist/index.js" "discord"

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

# Check Web App (served by API)
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    print_success "Web app is being served at http://localhost:3000"
else
    print_warning "Web app may not be ready yet at http://localhost:3000"
fi

# Check Discord Bot
if ps aux | grep -E "discord.*bot.*dist/index.js" | grep -v grep > /dev/null 2>&1; then
    print_success "Discord bot is running"
else
    print_warning "Discord bot may not be ready yet"
fi

echo ""
echo "🎉 Production Deployment Complete!"
echo "================================="
echo "📊 API Server:     http://localhost:3000"
echo "🌐 Web App:       http://localhost:3000 (served by API)"
echo "🤖 Discord Bot:   Running in background"
echo "🗄️  Database:      Neon (cloud-hosted)"
echo "📁 MinIO Console:  http://localhost:9001 (admin/minioadmin123)"
echo ""
echo "📝 To stop all services, run: pnpm deploy:stop && docker compose down"
echo ""
echo "Happy deploying! 🚀"

