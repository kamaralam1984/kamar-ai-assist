#!/usr/bin/env bash
# Install the free local AI for Piyu (Ollama + Qwen2.5 3B + the "piyu-teacher" persona). Run on the VPS as root. 100% free, no API key.
# Limits keep a shared server safe: low CPU priority, memory cap, model unloads 30 s after use.
set -euo pipefail
BASE="${PIYU_BASE_MODEL:-qwen2.5:3b-instruct}"
if ! command -v ollama >/dev/null; then
  curl -fL -o /tmp/ollama.tzst https://ollama.com/download/ollama-linux-amd64.tar.zst
  zstd -dc /tmp/ollama.tzst | tar -x -C /usr/local --exclude="lib/ollama/cuda*" --exclude="lib/ollama/rocm*" --exclude="lib/ollama/vulkan*"; rm -f /tmp/ollama.tzst
fi
id ollama >/dev/null 2>&1 || useradd -r -s /bin/false -m -d /var/lib/ollama ollama
cat > /etc/systemd/system/ollama.service <<EOF
[Unit]
Description=Ollama (local AI model for Piyu)
After=network.target
[Service]
ExecStart=/usr/local/bin/ollama serve
User=ollama
Group=ollama
Restart=on-failure
RestartSec=5
Environment=OLLAMA_HOST=127.0.0.1:11434
Environment=OLLAMA_MODELS=/var/lib/ollama/models
Environment=OLLAMA_KEEP_ALIVE=30s
Environment=OLLAMA_MAX_LOADED_MODELS=1
Environment=OLLAMA_NUM_PARALLEL=1
Environment=OLLAMA_NUM_THREAD=2
Nice=15
CPUQuota=150%
MemoryHigh=2300M
MemoryMax=2700M
IOSchedulingClass=idle
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload; systemctl enable --now ollama; sleep 3
ollama pull "$BASE"
cat > /tmp/Modelfile <<EOF
FROM $BASE
PARAMETER temperature 0.2
PARAMETER top_p 0.9
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 3072
PARAMETER num_predict 220
SYSTEM """You are Piyu, a calm, respectful Indian personal assistant and teacher. Speak natural, simple Hindi, Hinglish or Indian English like a friendly colleague, in short spoken sentences with no markdown or emojis. Answer only from the given document excerpts and tasks; if the answer is not there, say so. Keep every name, number and date exactly as written."""
EOF
ollama create piyu-teacher -f /tmp/Modelfile
echo "done: ollama list"; ollama list
