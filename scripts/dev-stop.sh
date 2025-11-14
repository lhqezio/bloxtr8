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
    local killed=false
    if [ "$service_name" = "payments-service" ]; then
        payments_service_pids=$(pgrep -f "payments-service.*dist/index.js" 2>/dev/null || true)
        if [ -n "$payments_service_pids" ]; then
            print_status "Found payments-service processes (PIDs: $payments_service_pids)"
            for pid in $payments_service_pids; do
                print_status "Killing payments-service process (PID: $pid)..."
                kill $pid 2>/dev/null || true
                sleep 1
                if kill -0 $pid 2>/dev/null; then
                    print_warning "Force killing payments-service process (PID: $pid)..."
                    kill -9 $pid 2>/dev/null || true
                fi
            done
            print_success "payments-service stopped"
        else
            payments_service_pids=$(pgrep -f "payments-service" 2>/dev/null || true)
            if [ -n "$payments_service_pids" ]; then
                print_status "Found payments-service processes with broader pattern (PIDs: $payments_service_pids)"
                for pid in $payments_service_pids; do
                    print_status "Killing payments-service process (PID: $pid)..."
                    kill $pid 2>/dev/null || true
                    sleep 1
                    if kill -0 $pid 2>/dev/null; then
                        print_warning "Force killing payments-service process (PID: $pid)..."
                        kill -9 $pid 2>/dev/null || true
                    fi
                done
                print_success "payments-service stopped"
            else
                print_warning "No payments-service process found"
            fi
        fi
    fi
    
    if [ "$service_name" = "discord-bot" ]; then
        bot_pids=$(pgrep -f "discord.*bot.*dist/index.js" 2>/dev/null || true)
        if [ -n "$bot_pids" ]; then
            print_status "Found Discord bot processes (PIDs: $bot_pids)"
            for pid in $bot_pids; do
                print_status "Killing Discord bot process (PID: $pid)..."
                kill $pid 2>/dev/null || true
                sleep 1
                if kill -0 $pid 2>/dev/null; then
                    print_warning "Force killing Discord bot process (PID: $pid)..."
                    kill -9 $pid 2>/dev/null || true
                fi
            done
            print_success "Discord bot stopped"
        else
            # Also try broader pattern in case the above doesn't match
            bot_pids=$(pgrep -f "discord.*bot" 2>/dev/null || true)
            if [ -n "$bot_pids" ]; then
                print_status "Found Discord bot processes with broader pattern (PIDs: $bot_pids)"
                for pid in $bot_pids; do
                    print_status "Killing Discord bot process (PID: $pid)..."
                    kill $pid 2>/dev/null || true
                    sleep 1
                    if kill -0 $pid 2>/dev/null; then
                        print_warning "Force killing Discord bot process (PID: $pid)..."
                        kill -9 $pid 2>/dev/null || true
                    fi
                done
                print_success "Discord bot stopped"
            else
                print_warning "No Discord bot process found"
            fi
        fi
    fi
    local port=""
    case "$service_name" in
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
}
# Stop all services
stop_service "api"
stop_service "discord-bot"
stop_service "web-app"
stop_service "payments-service"
# Stop Docker services
print_status "Stopping Docker services..."
docker compose down
print_success "All development services stopped!"