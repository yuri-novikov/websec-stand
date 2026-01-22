#!/bin/bash

# VKR Security Stand - Scan Runner Script
# Usage: ./scripts/run_scan.sh <tool> <profile> <script_run_id> <target_url> <run_id> <batch_id>

# set -e  # Exit on any error - disabled to ensure metadata creation

# Default values
TOOL="${1:-zap}"
PROFILE="${2:-baseline}"
SCRIPT_RUN_ID="${3:-test_$(date +%s)}"
TARGET_URL="${4:-http://172.18.0.2:3000}"
RUN_ID="${5:-${SCRIPT_RUN_ID}}" # Используем правильный runId для файлов
BATCH_ID="${6:-unknown}" # Batch ID for organizing files

# Configuration
DOCKER_NETWORK="vkr-stand_dast-network"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ARTIFACTS_DIR="$PROJECT_ROOT/artifacts"
BATCH_DIR="$ARTIFACTS_DIR/$BATCH_ID"

# Create directories if they don't exist
mkdir -p "$BATCH_DIR"

echo "=== VKR Security Scan Runner ==="
echo "Tool: $TOOL"
echo "Profile: $PROFILE"
echo "Run ID: $RUN_ID"
echo "Target: $TARGET_URL"
echo "Timestamp: $(date)"
echo "================================="

# Function to run ZAP scan
run_zap_scan() {
    local run_id="$1"
    local target="$2"

    echo "Starting ZAP baseline scan..."

    # Always use baseline scan
    CMD="zap-baseline.py -t $target"

    # Run the scan (output will be captured by parent process)
    docker run --rm --network "$DOCKER_NETWORK" \
        zaproxy/zap-stable \
        $CMD 2>&1

    echo "ZAP baseline scan completed."
}

# Function to run Nikto scan
run_nikto_scan() {
    local profile="$1"
    local run_id="$2"
    local target="$3"

    echo "Starting Nikto scan..."

    # Basic Nikto scan command
    CMD="-h $target -Format txt -output /dev/stdout"

    # Run the scan (output will be captured by parent process)
    docker run --rm --network "$DOCKER_NETWORK" \
        alpine/nikto \
        -C all \
        -Tuning x \
        -Plugins ALL \
        $CMD 2>&1

    echo "Nikto scan completed."
}

# Function to run Wapiti scan
run_wapiti_scan() {
    local profile="$1"
    local run_id="$2"
    local target="$3"

    echo "Starting Wapiti scan..."

    # Basic Wapiti scan command
    CMD="--url $target --format txt --output /dev/stdout --flush-session --no-bugreport"

    # Run the scan (output will be captured by parent process)
    docker run --rm --network "$DOCKER_NETWORK" \
        cyberwatch/wapiti \
        -m sql,xss,ssrf,upload,redirect \
        --level 2 \
        --scope folder \
        --flush-attacks \
        $CMD 2>&1

    echo "Wapiti scan completed."
}

# Function to run other tools (placeholder)
run_other_tool() {
    local tool="$1"
    local profile="$2"
    local run_id="$3"
    local target="$4"

    echo "Tool '$tool' not yet implemented. Available: zap, nikto, wapiti"
    exit 1
}

# Main execution
START_TIME=$(date +%s)

case "$TOOL" in
    "zap")
        run_zap_scan "$RUN_ID" "$TARGET_URL"
        ;;
    "nikto")
        run_nikto_scan "$PROFILE" "$RUN_ID" "$TARGET_URL"
        ;;
    "wapiti")
        run_wapiti_scan "$PROFILE" "$RUN_ID" "$TARGET_URL"
        ;;
    *)
        run_other_tool "$TOOL" "$PROFILE" "$RUN_ID" "$TARGET_URL"
        ;;
esac

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

echo "Scan completed in ${DURATION} seconds"
echo "Run ID: $RUN_ID"
echo "=== Scan Complete ==="
