#!/bin/sh
set -e

MODEL="${OLLAMA_MODEL:-qwen2.5vl:3b}"

echo "=== Majordom Ollama ==="
echo "Model: $MODEL"

# Pornește Ollama server în background
ollama serve &
OLLAMA_PID=$!

# Așteaptă până când serverul răspunde
echo "Aștept Ollama să pornească..."
until ollama list > /dev/null 2>&1; do
  sleep 2
done
echo "Ollama pornit."

# Verifică modelul exact (nu doar prefixul)
if ! ollama list 2>/dev/null | grep -q "^${MODEL} \|^${MODEL}	"; then
  echo "Descarc modelul $MODEL (poate dura câteva minute)..."
  ollama pull "$MODEL"
  echo "Model descărcat."
else
  echo "Modelul $MODEL este deja prezent."
fi

echo "Ollama gata."

# Reia procesul principal în prim-plan
wait $OLLAMA_PID
