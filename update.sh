#!/bin/bash

# Mitsubishi Chatbot - Auto Update Script
# This script pulls the latest changes from git and applies them to Docker

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_BEFORE_UPDATE="${BACKUP_BEFORE_UPDATE:-true}"

# Function to print colored messages
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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if docker-compose exists
    if ! command_exists docker-compose && ! command_exists "docker compose"; then
        print_error "docker-compose is not installed!"
        exit 1
    fi
    
    # Check if git exists
    if ! command_exists git; then
        print_error "git is not installed!"
        exit 1
    fi
    
    # Check if we're in a git repository
    if ! git rev-parse --git-dir > /dev/null 2>&1; then
        print_error "Not a git repository! Please run this script from your project directory."
        exit 1
    fi
    
    # Check if docker-compose file exists
    if [ ! -f "$COMPOSE_FILE" ]; then
        print_error "Docker compose file not found: $COMPOSE_FILE"
        print_status "Looking for docker-compose files..."
        ls -la docker-compose*.yml 2>/dev/null || echo "No docker-compose files found!"
        exit 1
    fi
    
    print_success "All prerequisites met!"
}

# Function to create backup
create_backup() {
    if [ "$BACKUP_BEFORE_UPDATE" = "true" ]; then
        print_status "Creating database backup..."
        
        BACKUP_DIR="$PROJECT_DIR/backups"
        mkdir -p "$BACKUP_DIR"
        
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.sql.gz"
        
        # Check if containers are running
        if docker-compose -f "$COMPOSE_FILE" ps | grep -q "db"; then
            # Create backup
            docker-compose -f "$COMPOSE_FILE" exec -T db pg_dump -U postgres mitsubishi_chatbot | gzip > "$BACKUP_FILE" || {
                print_warning "Failed to create database backup, continuing anyway..."
                return 0
            }
            print_success "Backup created: $BACKUP_FILE"
        else
            print_warning "Database container not running, skipping backup"
        fi
    fi
}

# Function to pull latest changes
pull_latest() {
    print_status "Pulling latest changes from git..."
    
    # Fetch latest changes
    git fetch origin || {
        print_error "Failed to fetch from git! Check your internet connection."
        exit 1
    }
    
    # Get current branch
    CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
    print_status "Current branch: $CURRENT_BRANCH"
    
    # Check if there are updates
    LOCAL=$(git rev-parse HEAD)
    REMOTE=$(git rev-parse origin/$CURRENT_BRANCH)
    
    if [ "$LOCAL" = "$REMOTE" ]; then
        print_success "Already up to date! No updates needed."
        return 1
    else
        print_status "Updates available! Pulling..."
        git pull origin $CURRENT_BRANCH || {
            print_error "Failed to pull from git! You may have local changes that conflict."
            print_status "Try running: git stash && git pull && git stash pop"
            exit 1
        }
        
        # Show what was updated
        print_success "Updated to latest version!"
        print_status "Recent commits:"
        git log --oneline -5
        
        return 0
    fi
}

# Function to update Docker containers
update_docker() {
    local REBUILD_MODE="${1:-quick}"
    
    print_status "Updating Docker containers (mode: $REBUILD_MODE)..."
    
    # Stop containers gracefully
    print_status "Stopping current containers..."
    docker-compose -f "$COMPOSE_FILE" down --timeout 30
    
    if [ "$REBUILD_MODE" = "full" ]; then
        # Full rebuild with no cache
        print_status "Building containers from scratch (no cache)..."
        docker-compose -f "$COMPOSE_FILE" build --no-cache
    elif [ "$REBUILD_MODE" = "clean" ]; then
        # Clean rebuild with pulled images
        print_status "Pulling latest images and rebuilding..."
        docker-compose -f "$COMPOSE_FILE" pull
        docker-compose -f "$COMPOSE_FILE" build --no-cache
    else
        # Quick rebuild (uses cache)
        print_status "Building containers (using cache where possible)..."
        docker-compose -f "$COMPOSE_FILE" build
    fi
    
    # Start containers
    print_status "Starting containers..."
    docker-compose -f "$COMPOSE_FILE" up -d
    
    # Wait for services to be ready
    print_status "Waiting for services to start (30 seconds)..."
    sleep 30
    
    # Check if containers are running
    if docker-compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
        print_success "Containers are running!"
        
        # Show status
        print_status "Container status:"
        docker-compose -f "$COMPOSE_FILE" ps
        
        return 0
    else
        print_error "Containers failed to start properly!"
        print_status "Checking logs..."
        docker-compose -f "$COMPOSE_FILE" logs --tail=50
        return 1
    fi
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check health endpoint
    local HEALTH_URL="${DOMAIN:-http://localhost:3000}/health"
    
    # Try up to 5 times with 5 second delay
    for i in {1..5}; do
        if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
            print_success "Health check passed!"
            curl -s "$HEALTH_URL" | grep -o '"status":"healthy"' && print_success "API is healthy!"
            return 0
        fi
        print_status "Attempt $i/5: Waiting for API to be ready..."
        sleep 5
    done
    
    print_warning "Health check failed, but containers are running."
    print_status "You may need to wait a bit longer or check logs manually."
    return 1
}

# Function to show logs
show_logs() {
    print_status "Showing recent logs (last 30 lines)..."
    docker-compose -f "$COMPOSE_FILE" logs --tail=30
}

# Function to cleanup old backups and images
cleanup() {
    print_status "Cleaning up old resources..."
    
    # Remove old backups (keep last 7 days)
    if [ -d "$PROJECT_DIR/backups" ]; then
        print_status "Removing old backups (keeping last 7 days)..."
        find "$PROJECT_DIR/backups" -name "db_backup_*.sql.gz" -mtime +7 -delete 2>/dev/null || true
    fi
    
    # Clean up dangling Docker images
    print_status "Removing dangling Docker images..."
    docker image prune -f > /dev/null 2>&1 || true
    
    print_success "Cleanup complete!"
}

# Main execution
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Mitsubishi Chatbot - Auto Updater${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    # Parse arguments
    local REBUILD_MODE="quick"
    local SKIP_BACKUP=false
    local SKIP_VERIFY=false
    
    while [[ $# -gt 0 ]]; do
        case $1 in
            --full)
                REBUILD_MODE="full"
                shift
                ;;
            --clean)
                REBUILD_MODE="clean"
                shift
                ;;
            --quick)
                REBUILD_MODE="quick"
                shift
                ;;
            --no-backup)
                SKIP_BACKUP=true
                shift
                ;;
            --no-verify)
                SKIP_VERIFY=true
                shift
                ;;
            --help)
                echo "Usage: $0 [OPTIONS]"
                echo ""
                echo "Options:"
                echo "  --full       Full rebuild with no cache (slowest, most reliable)"
                echo "  --clean      Clean rebuild pulling latest images"
                echo "  --quick      Quick rebuild using cache (default, fastest)"
                echo "  --no-backup  Skip database backup before update"
                echo "  --no-verify  Skip health check verification"
                echo "  --help       Show this help message"
                echo ""
                echo "Examples:"
                echo "  $0                    # Quick update (default)"
                echo "  $0 --full             # Full rebuild (use after major changes)"
                echo "  $0 --no-backup        # Quick update without backup"
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                echo "Run '$0 --help' for usage information"
                exit 1
                ;;
        esac
    done
    
    # Set backup flag
    if [ "$SKIP_BACKUP" = "true" ]; then
        BACKUP_BEFORE_UPDATE="false"
    fi
    
    # Print configuration
    print_status "Configuration:"
    print_status "  Project directory: $PROJECT_DIR"
    print_status "  Docker compose file: $COMPOSE_FILE"
    print_status "  Rebuild mode: $REBUILD_MODE"
    print_status "  Backup enabled: $BACKUP_BEFORE_UPDATE"
    echo ""
    
    # Run update process
    check_prerequisites
    
    if ! pull_latest; then
        print_status "No git updates found. Checking if we should rebuild anyway..."
        read -p "Do you want to rebuild containers anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Update cancelled."
            exit 0
        fi
    fi
    
    create_backup
    update_docker "$REBUILD_MODE"
    
    if [ "$SKIP_VERIFY" = "false" ]; then
        verify_deployment
    fi
    
    cleanup
    
    echo ""
    print_success "✅ Update completed successfully!"
    echo ""
    print_status "Useful commands:"
    print_status "  View logs:    docker-compose -f $COMPOSE_FILE logs -f"
    print_status "  Status:       docker-compose -f $COMPOSE_FILE ps"
    print_status "  Stop:         docker-compose -f $COMPOSE_FILE down"
    print_status "  Admin panel:  https://chatbot.mcdonnellresorts.com/admin.html"
    echo ""
}

# Run main function
main "$@"
