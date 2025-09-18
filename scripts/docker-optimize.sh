#!/bin/bash

# Docker Compose Performance Optimization Script
# This script provides various optimization commands for Docker Compose

set -e

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

# Function to show help
show_help() {
    echo "Docker Compose Performance Optimization Script"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  build-base     Build the shared base image"
    echo "  build-fast     Build all services with optimizations"
    echo "  dev            Start development environment with optimizations"
    echo "  dev-build      Start development environment with auto-build"
    echo "  prod           Start production environment"
    echo "  clean          Clean up Docker resources"
    echo "  prune          Remove unused Docker resources"
    echo "  rebuild        Force rebuild all images"
    echo "  logs           Show logs for all services"
    echo "  stats          Show resource usage statistics"
    echo "  help           Show this help message"
    echo ""
    echo "Performance Tips:"
    echo "  - Use 'build-base' first to create shared base image"
    echo "  - Use 'dev' for development with hot reloading"
    echo "  - Use 'clean' to free up disk space"
    echo "  - Use 'prune' to remove unused images and containers"
}

# Function to build base image
build_base() {
    print_status "Building shared base image..."
    docker compose build base
    print_success "Base image built successfully!"
}

# Function to build all services with optimizations
build_fast() {
    print_status "Building all services with optimizations..."
    
    # Build base image first
    build_base
    
    # Build other services
    docker compose build --parallel
    print_success "All services built successfully!"
}

# Function to start development environment
start_dev() {
    print_status "Starting development environment with optimizations..."
    
    # Ensure base image exists
    if ! docker image inspect bloxtr8-base:latest >/dev/null 2>&1; then
        print_warning "Base image not found, building it first..."
        build_base
    fi
    
    # Start services with build
    docker compose up -d --build
    print_success "Development environment started!"
    print_status "Services available at:"
    echo "  - API: http://localhost:3000"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - MinIO: http://localhost:9001"
}

# Function to start development environment with auto-build
start_dev_build() {
    print_status "Starting development environment with auto-build..."
    
    # Always build base image first
    build_base
    
    # Build and start services
    docker compose up -d --build
    print_success "Development environment started with auto-build!"
    print_status "Services available at:"
    echo "  - API: http://localhost:3000"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - MinIO: http://localhost:9001"
}

# Function to start production environment
start_prod() {
    print_status "Starting production environment..."
    docker compose -f docker compose.yml up -d
    print_success "Production environment started!"
}

# Function to clean up Docker resources
clean_docker() {
    print_status "Cleaning up Docker resources..."
    
    # Stop and remove containers
    docker compose down
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    print_success "Docker cleanup completed!"
}

# Function to prune unused resources
prune_docker() {
    print_status "Pruning unused Docker resources..."
    docker system prune -af
    print_success "Docker prune completed!"
}

# Function to force rebuild
rebuild_all() {
    print_status "Force rebuilding all images..."
    docker compose build --no-cache --parallel
    print_success "All images rebuilt successfully!"
}

# Function to show logs
show_logs() {
    print_status "Showing logs for all services..."
    docker compose logs -f
}

# Function to show stats
show_stats() {
    print_status "Showing resource usage statistics..."
    docker stats
}

# Main script logic
case "${1:-help}" in
    "build-base")
        build_base
        ;;
    "build-fast")
        build_fast
        ;;
    "dev")
        start_dev
        ;;
    "dev-build")
        start_dev_build
        ;;
    "prod")
        start_prod
        ;;
    "clean")
        clean_docker
        ;;
    "prune")
        prune_docker
        ;;
    "rebuild")
        rebuild_all
        ;;
    "logs")
        show_logs
        ;;
    "stats")
        show_stats
        ;;
    "help"|*)
        show_help
        ;;
esac
