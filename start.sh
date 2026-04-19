#!/bin/bash
case "$1" in
  frontend)
    cd ui && npm run dev
    ;;
  backend)
    source backend/venv/bin/activate && uvicorn backend.app.main:app --reload
    ;;
  *)
    echo "Usage: ./start.sh [frontend|backend]"
    exit 1
    ;;
esac
