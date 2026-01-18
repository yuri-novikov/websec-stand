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
DOCKER_NETWORK="vkr-stand_vkr-stand"
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
echo "Network: $DOCKER_NETWORK"
echo "Timestamp: $(date)"
echo "================================="

# Function to run ZAP scan
run_zap_scan() {
    local profile="$1"
    local run_id="$2"
    local target="$3"

    echo "Starting ZAP $profile scan..."

    # Choose scan command based on profile
    case "$profile" in
        "baseline")
            CMD="zap-baseline.py -t $target"
            ;;
        "authenticated")
            # Use ZAP automation framework with simple authentication
            # Remove -quickout to avoid conflict with automation framework report job
            CMD="zap.sh -autorun /zap-config/zap_auth_simple.yaml -cmd"
            ;;
        *)
            echo "Unknown profile: $profile"
            exit 1
            ;;
    esac

    # Run the scan (output will be captured by parent process)
    docker run --rm --network="$DOCKER_NETWORK" \
        -v "$PROJECT_ROOT/zap-config:/zap-config:ro" \
        -v "$PROJECT_ROOT/zap-work:/zap/wrk" \
        zaproxy/zap-stable \
        $CMD 2>&1

    echo "ZAP scan completed."

    # For authenticated scans, wait for the report file to be generated
    echo "Profile is: $PROFILE"
    if [ "$profile" = "authenticated" ]; then
        echo "Entering authenticated scan post-processing..."
        echo "Waiting for authentication report to be generated..."
        REPORT_PATH="$PROJECT_ROOT/zap-work/authenticated_report.json"
        MAX_WAIT=120  # Wait up to 2 minutes for report generation
        WAIT_COUNT=0

        while [ ! -f "$REPORT_PATH" ] && [ $WAIT_COUNT -lt $MAX_WAIT ]; do
            echo "Waiting for report... ($WAIT_COUNT/$MAX_WAIT)"
            sleep 5
            WAIT_COUNT=$((WAIT_COUNT + 5))
        done

        if [ -f "$REPORT_PATH" ]; then
            echo "✅ Authentication report generated successfully"
            # Move directly to artifacts directory with run-specific name
            cp "$REPORT_PATH" "$BATCH_DIR/${run_id}_report.json"
            echo "Report saved to: $BATCH_DIR/${run_id}_report.json"
        else
            echo "❌ Authentication report was not generated within $MAX_WAIT seconds"
        fi
    fi
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
    docker run --rm --network="$DOCKER_NETWORK" \
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
    docker run --rm --network="$DOCKER_NETWORK" \
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
        run_zap_scan "$PROFILE" "$RUN_ID" "$TARGET_URL"
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
