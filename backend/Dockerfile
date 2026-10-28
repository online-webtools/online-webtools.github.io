FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DENO_INSTALL=/usr/local

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl unzip git \
    && curl -fsSL https://deno.land/install.sh | sh \
    && deno --version \
    && git clone --depth 1 --branch 2.0.2 https://github.com/Brainicism/bgutil-ytdlp-pot-provider.git /root/bgutil-ytdlp-pot-provider \
    && cd /root/bgutil-ytdlp-pot-provider/server \
    && deno install --allow-scripts=npm:canvas --frozen \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .
EXPOSE 10000
CMD ["sh", "-c", "cd /root/bgutil-ytdlp-pot-provider/server && (cd node_modules && deno run --allow-env --allow-net --allow-ffi=. --allow-read=. ../src/main.ts) & uvicorn main:app --host 0.0.0.0 --port ${PORT:-10000}"]
