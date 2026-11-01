#!/usr/bin/env bash
# One command to run everything locally.
set -e
cd "$(dirname "$0")"

echo "==> Installing backend dependencies"
pip install -q -r backend/requirements.txt

echo "==> Building the frontend"
(cd frontend && npm install --silent && npm run build)

echo "==> Starting The Royal Knot on http://localhost:8000"
cd backend
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
