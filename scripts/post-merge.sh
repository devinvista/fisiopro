#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm run build:libs
pnpm --filter @workspace/db run push
