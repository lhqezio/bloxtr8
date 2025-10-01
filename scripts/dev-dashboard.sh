#!/usr/bin/env bash
# Bloxtr8 Development Dashboard - 3 Column CLI UI
# Shows real-time status and logs for all services

set -e

# Colors and styling
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
GRAY='\033[0;37m'
NC='\033[0m' # No Color

# Unicode box drawing characters
BOX_H="─"
BOX_V="│"
BOX_TL="┌"
BOX_TR="┐"
BOX_BL="└"
BOX_BR="┘"

# Service configurations
declare -A SERVICES=(
    ["API"]="3000:port"
    ["WEB"]="5173:port"
    ["BOT"]="discord:process"
    ["DB"]="5432:docker"
    ["MINIO"]="9000:docker"
)

declare -A SERVICE_STATUS=()
declare -A PID_FILES=(
    ["API"]=".api.pid"
    ["WEB"]=".web-app.pid"
    ["BOT"]=".discord-bot.pid"
)

# Check service status
check_service_status() {
    local service=$1
    local config=${SERVICES[$service]}
    local port=$(echo $config | cut -d: -f1)
    local check_type=$(echo $config | cut -d: -f2)
    
    case $check_type in
        "port")
            if lsof -i :$port > /dev/null 2>&1; then
                SERVICE_STATUS[$service]="RUNNING"
            else
                SERVICE_STATUS[$service]="STOPPED"
            fi
            ;;
        "docker")
            local container_name=""
            case $service in
                "DB") container_name="bloxtr8-db" ;;
                "MINIO") container_name="bloxtr8-minio-1" ;;
            esac
            if [ -n "$container_name" ] && docker ps --format "table {{.Names}}" | grep -q "$container_name"; then
                SERVICE_STATUS[$service]="RUNNING"
            else
                SERVICE_STATUS[$service]="STOPPED"
            fi
            ;;
        "process")
            local pid_file=${PID_FILES[$service]}
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file")
                if kill -0 $pid 2>/dev/null; then
                    SERVICE_STATUS[$service]="RUNNING"
                else
                    SERVICE_STATUS[$service]="STOPPED"
                fi
            else
                SERVICE_STATUS[$service]="STOPPED"
            fi
            ;;
        *)
            if lsof -i :$port > /dev/null 2>&1; then
                SERVICE_STATUS[$service]="RUNNING"
            else
                SERVICE_STATUS[$service]="STOPPED"
            fi
            ;;
    esac
}

# Get service logs
get_service_logs() {
    local service=$1
    local lines=5
    
    case $service in
        "API"|"WEB"|"BOT")
            # Get recent logs from process
            local pid_file=${PID_FILES[$service]}
            if [ -f "$pid_file" ]; then
                local pid=$(cat "$pid_file")
                if kill -0 $pid 2>/dev/null; then
                    echo "Service is running (PID: $pid)"
                else
                    echo "Service is not running"
                fi
            else
                echo "No PID file found"
            fi
            ;;
        "DB"|"MINIO")
            # Get Docker logs
            local container_name=""
            case $service in
                "DB") container_name="bloxtr8-db" ;;
                "MINIO") container_name="bloxtr8-minio-1" ;;
            esac
            if [ -n "$container_name" ]; then
                docker logs --tail $lines "$container_name" 2>/dev/null || echo "No logs available"
            else
                echo "No logs available"
            fi
            ;;
    esac
}

# Draw the main dashboard
draw_dashboard() {
    # Clear screen
    printf "\033[2J\033[H"
    
    # Header
    echo -e "${PURPLE}╔══════════════════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${PURPLE}║${NC} ${WHITE}🚀 Bloxtr8 Development Dashboard${NC} ${PURPLE}║${NC}"
    echo -e "${PURPLE}╚══════════════════════════════════════════════════════════════════════════════╝${NC}"
    
    # Instructions
    echo -e "${YELLOW}Press 'q' to quit, 'r' to refresh, 's' to show all logs, 'h' for help${NC}"
    echo ""
    
    # Draw the three main columns
    local col1_x=2
    local col2_x=30
    local col3_x=58
    
    # Column 1: API Server
    echo -e "${CYAN}┌─────────────── API Server ───────────────┐${NC}"
    echo -e "${CYAN}│${NC} Status: "
    case ${SERVICE_STATUS["API"]} in
        "RUNNING") echo -ne "${GREEN}● RUNNING${NC}" ;;
        "STOPPED") echo -ne "${RED}● STOPPED${NC}" ;;
        *) echo -ne "${YELLOW}● UNKNOWN${NC}" ;;
    esac
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Port: 3000"
    echo -e "${CYAN}│${NC} Health: http://localhost:3000/health"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Recent logs:"
    echo -e "${CYAN}│${NC} $(get_service_logs "API" | head -3 | tr '\n' ' ')"
    echo -e "${CYAN}└──────────────────────────────────────────┘${NC}"
    
    # Column 2: Web App
    echo -e "${CYAN}┌─────────────── Web App ──────────────────┐${NC}"
    echo -e "${CYAN}│${NC} Status: "
    case ${SERVICE_STATUS["WEB"]} in
        "RUNNING") echo -ne "${GREEN}● RUNNING${NC}" ;;
        "STOPPED") echo -ne "${RED}● STOPPED${NC}" ;;
        *) echo -ne "${YELLOW}● UNKNOWN${NC}" ;;
    esac
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Port: 5173"
    echo -e "${CYAN}│${NC} URL: http://localhost:5173"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Recent logs:"
    echo -e "${CYAN}│${NC} $(get_service_logs "WEB" | head -3 | tr '\n' ' ')"
    echo -e "${CYAN}└──────────────────────────────────────────┘${NC}"
    
    # Column 3: Discord Bot
    echo -e "${CYAN}┌─────────────── Discord Bot ──────────────┐${NC}"
    echo -e "${CYAN}│${NC} Status: "
    case ${SERVICE_STATUS["BOT"]} in
        "RUNNING") echo -ne "${GREEN}● RUNNING${NC}" ;;
        "STOPPED") echo -ne "${RED}● STOPPED${NC}" ;;
        *) echo -ne "${YELLOW}● UNKNOWN${NC}" ;;
    esac
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Type: Process"
    echo -e "${CYAN}│${NC} PID File: .discord-bot.pid"
    echo -e "${CYAN}│${NC}"
    echo -e "${CYAN}│${NC} Recent logs:"
    echo -e "${CYAN}│${NC} $(get_service_logs "BOT" | head -3 | tr '\n' ' ')"
    echo -e "${CYAN}└──────────────────────────────────────────┘${NC}"
    
    echo ""
    
    # Bottom section: Database and MinIO status
    echo -e "${CYAN}Database Services:${NC}"
    echo -ne "Database (PostgreSQL): "
    case ${SERVICE_STATUS["DB"]} in
        "RUNNING") echo -e "${GREEN}● RUNNING${NC}" ;;
        "STOPPED") echo -e "${RED}● STOPPED${NC}" ;;
        *) echo -e "${YELLOW}● UNKNOWN${NC}" ;;
    esac
    
    echo -ne "MinIO (Storage): "
    case ${SERVICE_STATUS["MINIO"]} in
        "RUNNING") echo -e "${GREEN}● RUNNING${NC}" ;;
        "STOPPED") echo -e "${RED}● STOPPED${NC}" ;;
        *) echo -e "${YELLOW}● UNKNOWN${NC}" ;;
    esac
    
    echo ""
    echo -e "${GRAY}Last updated: $(date '+%H:%M:%S')${NC}"
}

# Update all service statuses
update_all_statuses() {
    for service in "${!SERVICES[@]}"; do
        check_service_status "$service"
    done
}

# Show help
show_help() {
    printf "\033[2J\033[H"
    echo -e "${WHITE}Bloxtr8 Development Dashboard Help${NC}"
    echo "=================================="
    echo ""
    echo -e "${YELLOW}Keyboard Controls:${NC}"
    echo "  q - Quit dashboard"
    echo "  r - Refresh status"
    echo "  s - Show all service logs"
    echo "  h - Show this help"
    echo ""
    echo -e "${YELLOW}Service Status:${NC}"
    echo "  ${GREEN}● RUNNING${NC} - Service is active and responding"
    echo "  ${RED}● STOPPED${NC} - Service is not running"
    echo "  ${YELLOW}● UNKNOWN${NC} - Status could not be determined"
    echo ""
    echo -e "${YELLOW}Columns:${NC}"
    echo "  Left: API Server (port 3000)"
    echo "  Middle: Web App (port 5173)"
    echo "  Right: Discord Bot"
    echo ""
    echo "Press any key to return to dashboard..."
    read -n 1 2>/dev/null || sleep 3
}

# Show all logs
show_all_logs() {
    printf "\033[2J\033[H"
    echo -e "${WHITE}All Service Logs${NC}"
    echo "=================="
    echo ""
    
    for service in "${!SERVICES[@]}"; do
        echo -e "${CYAN}=== $service Logs ===${NC}"
        get_service_logs "$service"
        echo ""
        echo "----------------------------------------"
        echo ""
    done
    
    echo "Press any key to return to dashboard..."
    read -n 1 2>/dev/null || sleep 3
}

# Main dashboard loop
main_loop() {
    # Check if we have a proper TTY for interactive mode
    if [ -t 0 ]; then
        # Save terminal settings
        old_tty_settings=$(stty -g 2>/dev/null)
    fi
    
    while true; do
        update_all_statuses
        draw_dashboard
        
        # Read user input with timeout
        if [ -t 0 ]; then
            # Interactive mode: read with timeout
            if read -t 5 -n 1 key 2>/dev/null; then
                case $key in
                    'q'|'Q')
                        break
                        ;;
                    'r'|'R')
                        # Refresh - already handled by loop
                        ;;
                    's'|'S')
                        show_all_logs
                        ;;
                    'h'|'H')
                        show_help
                        ;;
                esac
            fi
        else
            # Non-interactive mode: just sleep and refresh
            sleep 5
        fi
    done
    
    # Restore terminal settings if saved
    if [ -n "$old_tty_settings" ]; then
        stty "$old_tty_settings" 2>/dev/null
    fi
}

# Signal handlers
cleanup() {
    printf "\033[2J\033[H"
    echo -ne "\033[?25h" # Show cursor
    exit 0
}

trap cleanup INT TERM

# Check if services are running
echo -e "${BLUE}🚀 Starting Bloxtr8 Development Dashboard${NC}"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "apps" ]; then
    echo -e "${RED}Error: Please run this script from the Bloxtr8 project root${NC}"
    exit 1
fi

# Start the dashboard
main_loop

# Cleanup
printf "\033[2J\033[H"
echo -ne "\033[?25h" # Show cursor
echo -e "${GREEN}Dashboard closed. Goodbye! 👋${NC}"