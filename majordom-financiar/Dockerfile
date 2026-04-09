FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

COPY . .

RUN mkdir -p /app/data

ENV PYTHONPATH=/app
ENV MEMORY_DB_PATH=/app/data/memory.db
ENV PYTHONUNBUFFERED=1

CMD ["python", "bot/main.py"]
