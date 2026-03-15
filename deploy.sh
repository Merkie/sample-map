#!/bin/bash
set -e

# ==============================================================================
# Deploy: Sample Map
# ==============================================================================
#
# Service:        sample-map
# Runtime:        bun (server + client build via Vite)
# Branch:         main
# Port:           3720
# Database:       None
# Working Dir:    /opt/sample-map
# Systemd Unit:   /etc/systemd/system/sample-map.service
# Nginx Config:   /etc/nginx/sites-available/samplemap.archers.tools
# URL:            https://samplemap.archers.tools
#
# Dependencies:   bun, python3 venv (for feature extraction)
#
# NOTE: Bun serves both the API and the static client from a single process.
#       Client must be built before restarting.
# ==============================================================================

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m'

SERVICE="sample-map"
BRANCH="main"
PORT=3720
DIR="/opt/sample-map"
BUN="/root/.bun/bin/bun"

echo ""
echo -e "${BOLD}========================================${NC}"
echo -e "${BOLD}  Deploying: ${CYAN}${SERVICE}${NC}"
echo -e "${BOLD}  Branch:    ${CYAN}${BRANCH}${NC}"
echo -e "${BOLD}  Port:      ${CYAN}${PORT}${NC}"
echo -e "${BOLD}========================================${NC}"
echo ""

# Step 1: Pull latest changes
echo -e "${YELLOW}[1/4] Pulling latest changes from origin/${BRANCH}...${NC}"
cd "$DIR"
git pull origin "$BRANCH"
echo ""

# Step 2: Install dependencies
echo -e "${YELLOW}[2/4] Installing dependencies...${NC}"
$BUN install
echo ""

# Step 3: Build client
echo -e "${YELLOW}[3/4] Building client (Vite)...${NC}"
cd "$DIR/client"
$BUN run build
echo ""

# Step 4: Restart service
echo -e "${YELLOW}[4/4] Restarting ${SERVICE}...${NC}"
systemctl restart "$SERVICE"
echo ""

# Verify
echo -e "${YELLOW}Verifying service health...${NC}"
sleep 3

if systemctl is-active --quiet "$SERVICE"; then
    echo -e "  ${GREEN}Service is active${NC}"
else
    echo -e "  ${RED}Service is NOT running!${NC}"
    echo ""
    echo -e "${RED}Recent logs:${NC}"
    journalctl -u "$SERVICE" -n 30 --no-pager
    exit 1
fi

echo ""
echo -e "${CYAN}Recent logs:${NC}"
journalctl -u "$SERVICE" -n 10 --no-pager
echo ""

echo -e "${GREEN}${BOLD}Deploy complete: ${SERVICE}${NC}"
echo -e "${CYAN}  URL: https://samplemap.archers.tools${NC}"
echo -e "${CYAN}  Logs: journalctl -u ${SERVICE} -f${NC}"
echo ""
