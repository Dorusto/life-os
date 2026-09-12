# Dockerfile for investment-manager service — same shape as
# tools/vehicle-manager/Dockerfile, own port.
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# PYTHONPATH=/app makes `from app.database...` work
ENV PYTHONPATH=/app

# Directory for the SQLite database (persisted via Docker volume)
RUN mkdir -p /app/data

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8020"]
