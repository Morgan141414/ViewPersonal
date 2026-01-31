# CPU image (works everywhere). For GPU acceleration see Dockerfile.gpu
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# system deps for opencv/mediapipe/insightface
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/ai/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/ai/app /app/app

EXPOSE 9000

CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9000"]
