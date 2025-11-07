#!/bin/bash
# Kill Discord bot and Node process on port 3000

set -e

echo "🛑 Killing Discord Bot and Node Process on Port 3000"
echo "====================================================="

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

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to kill process by PID file
kill_by_pid_file() {
    local service_name=$1
    local pid_file=".${service_name}.pid"
    
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
            rm -f "$pid_file"
            return 0
        else
            print_warning "$service_name was not running (stale PID file)"
            rm -f "$pid_file"
        fi
    fi
    return 1
}

# Kill Discord bot
print_status "Killing Discord bot..."

# Try PID file first (this might kill parent process)
kill_by_pid_file "discord-bot" || true

# Always check for and kill all discord bot processes (including child processes)
# This catches the actual node process even if PID file had parent process
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

# Kill Node process on port 3000
print_status "Killing Node process on port 3000..."

port_pids=$(lsof -t -i :3000 2>/dev/null || true)
if [ -n "$port_pids" ]; then
    print_status "Found processes on port 3000 (PIDs: $port_pids)"
    for pid in $port_pids; do
        # Check if it's a Node process
        if ps -p $pid -o comm= | grep -q node; then
            print_status "Killing Node process on port 3000 (PID: $pid)..."
            kill $pid 2>/dev/null || true
            sleep 1
            if kill -0 $pid 2>/dev/null; then
                print_warning "Force killing Node process (PID: $pid)..."
                kill -9 $pid 2>/dev/null || true
            fi
            print_success "Node process on port 3000 stopped"
        else
            print_warning "Process on port 3000 (PID: $pid) is not a Node process, skipping"
        fi
    done
else
    print_warning "No process found on port 3000"
fi

# Also try killing via PID file for API (which runs on port 3000)
kill_by_pid_file "api" || true

echo ""
print_success "Done! Discord bot and Node process on port 3000 have been stopped."
