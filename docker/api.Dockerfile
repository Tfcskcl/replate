# Build context is the REPO ROOT, not apps/api — railway.json points at this
# file via dockerfilePath, and Railway builds from the repository root. Paths
# below are therefore repo-relative; copying `requirements.txt` alone would
# fail because it lives at apps/api/requirements.txt.
FROM python:3.11-slim

WORKDIR /app

# libpq/gcc for asyncpg, the gl/glib pair for opencv-python-headless.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc ffmpeg libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY apps/api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/api/ .

# Railway (and most PaaS) inject $PORT; default to 8000 for local docker runs.
ENV PORT=8000
EXPOSE 8000

# Shell form so $PORT expands at runtime.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
