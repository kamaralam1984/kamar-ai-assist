# Piyu — one small image: Python backend + web app (+ optional Piper voices mounted from outside)
#   docker build -t piyu .
#   docker run -d --name piyu -p 8080:8080 -e PIYU_TOKEN=... -v piyu-data:/data -v ./voices:/app/voices:ro piyu
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIYU_DATA=/data PIYU_PORT=8080 PIYU_HOST=0.0.0.0 PIYU_BEHIND_PROXY=1
WORKDIR /app
# numpy + piper-tts give the offline neural voice; the server also works without them (the app then uses the browser voice)
RUN pip install --no-cache-dir numpy piper-tts \
    && useradd --system --home /app --shell /usr/sbin/nologin piyu && mkdir -p /data && chown piyu:piyu /data
COPY --chown=piyu:piyu . /app
USER piyu
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD python -c "import urllib.request,os;urllib.request.urlopen('http://127.0.0.1:%s/api/health'%os.environ.get('PIYU_PORT','8080'),timeout=4)" || exit 1
CMD ["python", "server.py"]
