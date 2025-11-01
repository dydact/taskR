#!/usr/bin/env bash
set -euo pipefail

# Local LLM bootstrap for macOS (Apple Silicon)
# - Starts Ollama (if not running) and pulls a suitable long-output model
# - Launches an OpenAI-compatible proxy on http://localhost:8001 using LiteLLM
# - taskR will route insight.llm traffic to this proxy (see providers.json)

MODEL_NAME_DEFAULT="qwen2.5:14b-instruct"
PORT=${PORT:-8001}
MODEL_NAME=${MODEL_NAME:-$MODEL_NAME_DEFAULT}

echo "[local-llm] Ensuring Ollama is installed..."
if ! command -v ollama >/dev/null 2>&1; then
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "[local-llm] Installing Ollama via Homebrew..."
    brew install ollama
  else
    echo "[local-llm] Please install Ollama manually: https://ollama.com/download"
    exit 1
  fi
fi

if ! pgrep -x "ollama" >/dev/null 2>&1; then
  echo "[local-llm] Starting Ollama..."
  nohup ollama serve >/tmp/ollama.log 2>&1 &
  sleep 2
fi

echo "[local-llm] Pulling model: ${MODEL_NAME}"
ollama pull "${MODEL_NAME}" || true

echo "[local-llm] Creating Python venv for LiteLLM proxy..."
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENV_DIR="$ROOT_DIR/.llm-venv"
python3 -m venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
pip install --quiet "litellm[proxy]" uvicorn

export LITELLM_OLLAMA_BASE="http://localhost:11434"
echo "[local-llm] Starting LiteLLM OpenAI-compatible proxy on :${PORT} (backed by Ollama: ${MODEL_NAME})"
exec litellm --model "ollama/${MODEL_NAME}" --host 0.0.0.0 --port ${PORT} --num_workers 1
