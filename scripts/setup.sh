#!/usr/bin/env bash
# =============================================================================
# RYME — Development Environment Setup
# =============================================================================
# One-command setup for the RYME development environment.
# Requires: Node.js >= 20, pnpm >= 9, Docker Engine
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[RYME]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# =============================================================================
# 1. Check prerequisites
# =============================================================================
log "Checking prerequisites..."

command -v node >/dev/null 2>&1 || error "Node.js is not installed"
command -v pnpm >/dev/null 2>&1 || error "pnpm is not installed (npm install -g pnpm)"
command -v docker >/dev/null 2>&1 || error "Docker is not installed"

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  error "Node.js >= 20 required (found v$(node -v))"
fi

docker info >/dev/null 2>&1 || error "Docker daemon is not running"

success "All prerequisites met"

# =============================================================================
# 2. Create .env from template
# =============================================================================
if [ ! -f .env ]; then
  log "Creating .env from .env.example..."
  cp .env.example .env
  success ".env created"
else
  warn ".env already exists, skipping"
fi

# =============================================================================
# 3. Install dependencies
# =============================================================================
log "Installing dependencies..."
pnpm install
success "Dependencies installed"

# =============================================================================
# 4. Start infrastructure (PostgreSQL + Traefik)
# =============================================================================
log "Starting infrastructure containers..."
docker compose -f docker/docker-compose.yml up -d
success "PostgreSQL and Traefik started"

# Wait for PostgreSQL to be ready
log "Waiting for PostgreSQL to accept connections..."
for i in {1..30}; do
  if docker exec ryme-postgres pg_isready -U ryme >/dev/null 2>&1; then
    success "PostgreSQL is ready"
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "PostgreSQL failed to start within 30 seconds"
  fi
  sleep 1
done

# =============================================================================
# 5. Run database migrations
# =============================================================================
log "Running database migrations..."
pnpm db:generate
pnpm db:migrate
success "Database migrations complete"

# =============================================================================
# 6. Seed database
# =============================================================================
log "Seeding database..."
pnpm db:seed
success "Database seeded"

# =============================================================================
# 7. Create workspace directory
# =============================================================================
mkdir -p data/workspaces
success "Workspace directory created"

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         RYME setup complete! 🚀            ║${NC}"
echo -e "${GREEN}╠════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}║                                            ║${NC}"
echo -e "${GREEN}║  Run:  pnpm dev                            ║${NC}"
echo -e "${GREEN}║                                            ║${NC}"
echo -e "${GREEN}║  Dashboard:  http://localhost:5173          ║${NC}"
echo -e "${GREEN}║  API:        http://localhost:3001          ║${NC}"
echo -e "${GREEN}║  Traefik:    http://localhost:8080          ║${NC}"
echo -e "${GREEN}║  DB Studio:  pnpm db:studio                ║${NC}"
echo -e "${GREEN}║                                            ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════╝${NC}"
