# Study Mate API, for Railway (or any Docker host).
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Audio, uploaded briefs and generated decks. On Railway, attach a volume at /data so they survive redeploys.
ENV MEDIA_DIR=/data/media

# Railway sets PORT; default to 8010 elsewhere.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8010} --proxy-headers --forwarded-allow-ips='*'"]
