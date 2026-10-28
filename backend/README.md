# Online Webtools Video API

This is a prototype backend for the GitHub Pages frontend. It uses FastAPI and yt-dlp. FFmpeg is included in the Docker image for merging supported formats.

## Deploy to Render

1. Open Render and choose **New + → Blueprint**.
2. Connect the GitHub repository `online-webtools/online-webtools.github.io`.
3. Render should detect `render.yaml`. Review and deploy the service.
4. After deployment, check `https://YOUR-SERVICE.onrender.com/api/health`.
5. The frontend still needs to be connected to the deployed API URL.

## API

- `GET /api/health`
- `POST /api/info` with JSON body `{"url":"https://example.com/video"}`
- `POST /api/download?format_id=best` with the same JSON body

## Important limitations

This is a prototype, not a hardened public production downloader. Platform support changes, some videos require authentication or are DRM-protected, and free hosting has CPU, memory, timeout, disk, and bandwidth limits. Only download content you are authorized to download. Before public launch, add rate limiting, request/job limits, robust SSRF protection for redirects and extractor subrequests, temp-file cleanup, monitoring, and abuse prevention. Do not expose cookies or secrets in the frontend.
