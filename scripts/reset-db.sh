#!/usr/bin/env bash
# =============================================================================
# PULSE — Database Reset
# =============================================================================
# Drops and recreates the database, runs migrations, and re-seeds.
# WARNING: This destroys all data.
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${CYAN}[PULSE]${NC} $1"; }
success() { echo -e "${GREEN}[✓]${NC} $1"; }
error() { echo -e "${RED}[✗]${NC} $1"; exit 1; }

echo -e "${RED}⚠ This will DESTROY all data in the database.${NC}"
read -p "Are you sure? (y/N): " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Cancelled."
  exit 0
fi

log "Resetting database..."
pnpm db:reset
success "Database reset"

log "Seeding database..."
pnpm db:seed
success "Database seeded"

echo ""
success "Database reset complete"
