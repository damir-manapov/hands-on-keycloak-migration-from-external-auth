#!/usr/bin/env bash

set -euo pipefail

echo "▶ Formatting code with Prettier"
yarn format

echo "▶ Running ESLint"
yarn lint

echo "▶ Building TypeScript project"
yarn build

echo "▶ Running security audit"
yarn audit

echo "▶ Checking for outdated dependencies"
yarn outdated

echo "✅ All checks completed"

