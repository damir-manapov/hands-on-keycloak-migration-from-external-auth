#!/usr/bin/env bash

set -euo pipefail

echo "▶ Running Prettier check"
yarn format:check

echo "▶ Running ESLint"
yarn lint

echo "▶ Building TypeScript project"
yarn build

echo "▶ Running security audit"
yarn audit

echo "▶ Checking for outdated dependencies"
yarn outdated

echo "✅ All checks completed"

