#!/bin/bash
# Stop development services script for Bloxtr8

set -e

echo "🛑 Stopping Bloxtr8 Development Environment"
echo "========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to stop service by PID file
stop_service() {
    local service_name=$1
    local pid_file=".${service_name}.pid"
    local killed=false
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            print_status "Stopping $service_name (PID: $pid)..."
            kill $pid 2>/dev/null || true
            # Wait for graceful shutdown
            sleep 2
            if kill -0 $pid 2>/dev/null; then
                print_warning "Force killing $service_name..."
                kill -9 $pid 2>/dev/null || true
            fi
            print_success "$service_name stopped"
            killed=true
        else
            print_warning "$service_name was not running (stale PID file)"
        fi
        rm -f "$pid_file"
    else
        print_warning "No PID file found for $service_name"
    fi
    
    # If PID file method didn't work, try killing by port
    if [ "$killed" = false ]; then
        local port=""
        case $service_name in
            "api") port=3000 ;;
            "web-app") port=5173 ;;
        esac
        
        if [ -n "$port" ]; then
            local pids=$(lsof -t -i :$port 2>/dev/null || true)
            if [ -n "$pids" ]; then
                print_status "Found $service_name running on port $port (PIDs: $pids)"
                for pid in $pids; do
                    kill $pid 2>/dev/null || true
                    sleep 1
                    if kill -0 $pid 2>/dev/null; then
                        kill -9 $pid 2>/dev/null || true
                    fi
                done
                print_success "$service_name stopped (by port)"
            fi
        fi
    fi
}

# Stop all services
stop_service "api"
stop_service "discord-bot"
stop_service "web-app"

# Stop Docker services
print_status "Stopping Docker services..."
docker compose down

# Clean up any remaining processes
print_status "Cleaning up any remaining processes..."

# Kill any remaining node processes that might be from our dev servers
pkill -f "tsx watch.*src/index.ts" 2>/dev/null || true
pkill -f "vite.*5173" 2>/dev/null || true

print_success "All development services stopped!"
echo ""
echo "🔧 To restart, run: pnpm dev:hoang"
