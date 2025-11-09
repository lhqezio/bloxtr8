#!/usr/bin/env bash

# Compatibility wrapper that forwards to scripts/kafka/setup-topics.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SETUP_SCRIPT="${ROOT_DIR}/kafka/setup-topics.sh"

if [[ ! -f "$SETUP_SCRIPT" ]]; then
  echo "Unable to locate Kafka setup script at $SETUP_SCRIPT" >&2
  exit 1
fi

if [[ ! -x "$SETUP_SCRIPT" ]]; then
  RUNNER=(bash "$SETUP_SCRIPT")
else
  RUNNER=("$SETUP_SCRIPT")
fi

if [[ -n "${BROKER:-}" && -z "${BOOTSTRAP_SERVERS:-}" ]]; then
  export BOOTSTRAP_SERVERS="$BROKER"
fi

FORWARDED_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --broker)
      if [[ $# -lt 2 ]]; then
        echo "Missing value for --broker" >&2
        exit 1
      fi
      FORWARDED_ARGS+=("--bootstrap-servers" "$2")
      shift 2
      ;;
    *)
      FORWARDED_ARGS+=("$1")
      shift
      ;;
  esac
done

exec "${RUNNER[@]}" "${FORWARDED_ARGS[@]}"


