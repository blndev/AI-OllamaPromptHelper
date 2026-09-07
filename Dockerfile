# syntax=docker/dockerfile:1
FROM python:3.13-slim

WORKDIR /app

# Install dependencies first so this layer is cached across code-only changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code and frontend assets.
COPY app/ ./app/
COPY static/ ./static/
COPY config.json ./config.json

# Force debugMode off in the shipped image regardless of the committed
# config.json value; enable it only via a mounted config.local.json.
RUN python -c "import json; p='config.json'; d=json.load(open(p)); d['debugMode']=False; json.dump(d, open(p, 'w'), indent=2)"

# presets/ and output/ are meant to be mounted as volumes so preset and chat
# data survive container restarts/rebuilds; create them as a fallback.
RUN mkdir -p presets output \
    && useradd --create-home --uid 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
