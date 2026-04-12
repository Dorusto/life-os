#!/bin/sh
set -e

VISION_MODEL="${OLLAMA_VISION_MODEL:-qwen2.5vl:7b}"
CHAT_MODEL="${OLLAMA_CHAT_MODEL:-qwen2.5:7b}"

echo "=== Majordom Ollama ==="
echo "Vision model: $VISION_MODEL"
echo "Chat model:   $CHAT_MODEL"

# Start Ollama server in the background
ollama serve &
OLLAMA_PID=$!

# Wait until the server responds
echo "Waiting for Ollama to start..."
until ollama list > /dev/null 2>&1; do
  sleep 2
done
echo "Ollama started."

# Pull vision model if not present
if ! ollama list 2>/dev/null | grep -q "^${VISION_MODEL} \|^${VISION_MODEL}	"; then
  echo "Downloading vision model $VISION_MODEL (this may take a few minutes)..."
  ollama pull "$VISION_MODEL"
  echo "Vision model downloaded."
else
  echo "Vision model $VISION_MODEL already present."
fi

# Pull chat model if not present
if ! ollama list 2>/dev/null | grep -q "^${CHAT_MODEL} \|^${CHAT_MODEL}	"; then
  echo "Downloading chat model $CHAT_MODEL (this may take a few minutes)..."
  ollama pull "$CHAT_MODEL"
  echo "Chat model downloaded."
else
  echo "Chat model $CHAT_MODEL already present."
fi

echo "Ollama ready."

# Hand back to the foreground process
wait $OLLAMA_PID
