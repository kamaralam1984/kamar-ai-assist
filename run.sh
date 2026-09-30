#!/usr/bin/env bash
# Piyu chalane ke liye: ./run.sh  ->  http://localhost:8080
# Phone/doosre computer se sync ke liye: ./run.sh --lan  (token ke saath)
cd "$(dirname "$0")"
PY=python3; [ -x .venv/bin/python ] && PY=.venv/bin/python
(sleep 2; xdg-open http://localhost:8080 >/dev/null 2>&1) &
exec $PY server.py 8080 "$@"
