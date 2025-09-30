#!/bin/bash
# View development logs script for Bloxtr8

echo "📊 Bloxtr8 Development Logs"
echo "=========================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo -e "${BLUE}=== $1 ===${NC}"
}

# Function to show logs for a service
show_service_logs() {
    local service_name=$1
    local filter=$2
    local pid_file=".${service_name}.pid"
    
    print_header "$service_name Logs"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo -e "${GREEN}$service_name is running (PID: $pid)${NC}"
            echo "Recent output from the service:"
            echo "----------------------------"
            # Show recent output from the process (if any)
            echo "Use 'tail -f' on the terminal where you started the service to see live logs"
        else
            echo -e "${RED}$service_name is not running${NC}"
        fi
    else
        echo -e "${YELLOW}No PID file found for $service_name${NC}"
    fi
    echo ""
}

# Function to show Docker logs
show_docker_logs() {
    print_header "Docker Services Logs"
    
    if docker compose ps | grep -q "Up"; then
        echo "Docker services status:"
        docker compose ps
        echo ""
        echo "To see live Docker logs, run:"
        echo "  docker compose logs -f test-db"
        echo "  docker compose logs -f minio"
    else
        echo -e "${RED}No Docker services are running${NC}"
    fi
    echo ""
}

# Function to show port status
show_port_status() {
    print_header "Port Status"
    
    echo "Checking active ports..."
    
    # Check API
    if lsof -i :3000 > /dev/null 2>&1; then
        echo -e "✅ API Server (3000): ${GREEN}Active${NC}"
    else
        echo -e "❌ API Server (3000): ${RED}Inactive${NC}"
    fi
    
    # Check Web App
    if lsof -i :5173 > /dev/null 2>&1; then
        echo -e "✅ Web App (5173): ${GREEN}Active${NC}"
    else
        echo -e "❌ Web App (5173): ${RED}Inactive${NC}"
    fi
    
    # Check Database
    if lsof -i :5432 > /dev/null 2>&1; then
        echo -e "✅ Database (5432): ${GREEN}Active${NC}"
    else
        echo -e "❌ Database (5432): ${RED}Inactive${NC}"
    fi
    
    # Check MinIO
    if lsof -i :9000 > /dev/null 2>&1; then
        echo -e "✅ MinIO (9000): ${GREEN}Active${NC}"
    else
        echo -e "❌ MinIO (9000): ${RED}Inactive${NC}"
    fi
    
    echo ""
}

# Main execution
show_port_status
show_service_logs "API Server" "@bloxtr8/api"
show_service_logs "Discord Bot" "@bloxtr8/discord-bot"
show_service_logs "Web App" "web-app"
show_docker_logs

echo "🔧 Useful commands:"
echo "  pnpm dev:hoang       - Start all services"
echo "  pnpm dev:hoang:stop  - Stop all services"
echo "  pnpm dev:hoang:logs  - Show this status"
echo "  docker compose logs -f [service] - View Docker service logs"
