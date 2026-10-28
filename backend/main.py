import ipaddress
import os
import socket
import tempfile
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, HttpUrl

app = FastAPI(title="Online Webtools Video API", version="0.1.0")

# Set FRONTEND_ORIGIN to your exact GitHub Pages origin after deployment.
frontend_origin = os.getenv("FRONTEND_ORIGIN", "https://online-webtools.github.io")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

class URLRequest(BaseModel):
    url: HttpUrl

def youtube_cookie_options():
    """Read an optional Netscape-format cookie file from the YOUTUBE_COOKIES secret."""
    cookie_text = os.getenv("YOUTUBE_COOKIES", "").strip()
    if not cookie_text:
        return {}, None
    handle = tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".txt", prefix="yt-cookies-", delete=False)
    try:
        handle.write(cookie_text)
        handle.close()
        os.chmod(handle.name, 0o600)
        return {"cookiefile": handle.name}, handle.name
    except Exception:
        try:
            os.unlink(handle.name)
        except OSError:
            pass
        raise

def validate_public_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise HTTPException(status_code=400, detail="Only valid HTTP/HTTPS URLs are supported.")
    host = parsed.hostname.rstrip(".").lower()
    if host in {"localhost", "localhost.localdomain"} or host.endswith(".local"):
        raise HTTPException(status_code=400, detail="Local URLs are not allowed.")
    try:
        addresses = socket.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
        for item in addresses:
            ip = ipaddress.ip_address(item[4][0].split("%")[0])
            if not ip.is_global:
                raise HTTPException(status_code=400, detail="Private or local network URLs are not allowed.")
    except socket.gaierror:
        raise HTTPException(status_code=400, detail="The URL host could not be resolved.")
    return value

@app.get("/api/health")
def health():
    return {"ok": True, "service": "online-webtools-video-api"}

@app.post("/api/info")
def video_info(body: URLRequest):
    url = validate_public_url(str(body.url))
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "socket_timeout": 15,
        # Try alternate clients when YouTube blocks its default web client.
        "extractor_args": {"youtube": {"player_client": ["tv", "web_safari"]}},
    }
    cookie_path = None
    try:
        cookie_opts, cookie_path = youtube_cookie_options()
        opts.update(cookie_opts)
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False)
        formats = []
        for item in info.get("formats", []):
            if item.get("url") and item.get("vcodec") != "none":
                formats.append({
                    "format_id": item.get("format_id"),
                    "ext": item.get("ext"),
                    "height": item.get("height"),
                    "filesize": item.get("filesize") or item.get("filesize_approx"),
                    "has_audio": item.get("acodec") != "none",
                })
        title = info.get("title") or "video-download"
        filename_title = title
        description = (info.get("description") or "").strip()
        extractor_name = (info.get("extractor_key") or "").lower()
        if "instagram" in extractor_name and description and title.lower().startswith(("video by ", "photo by ", "reel by ")):
            filename_title = description
        return {
            "title": title,
            "filename_title": filename_title,
            "thumbnail": info.get("thumbnail"),
            "duration": info.get("duration"),
            "extractor": info.get("extractor_key"),
            "formats": formats[:60],
        }
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Could not read this video: {str(exc)[:240]}")
    finally:
        if cookie_path:
            try:
                os.unlink(cookie_path)
            except OSError:
                pass

@app.post("/api/download")
def download_video(
    body: URLRequest,
    format_id: str = "best",
    mode: str = "video",
):
    url = validate_public_url(str(body.url))
    if mode not in {"video", "audio", "image"}:
        raise HTTPException(status_code=400, detail="mode must be video, audio, or image")

    temp_dir = tempfile.mkdtemp(prefix="video-dl-")
    output_template = str(Path(temp_dir) / "%(title).100s.%(ext)s")
    opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "outtmpl": output_template,
        "max_filesize": 500 * 1024 * 1024,
        "socket_timeout": 20,
        "retries": 2,
        "extractor_args": {"youtube": {"player_client": ["tv", "web_safari"]}},
    }
    if mode == "video":
        opts["format"] = format_id if format_id != "best" else "best[ext=mp4]/best"
        opts["merge_output_format"] = "mp4"
    elif mode == "audio":
        opts["format"] = "bestaudio/best"
        opts["postprocessors"] = [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }]
    else:
        # Let yt-dlp's extractor choose the native media for photo posts.
        # Some sources only expose a cover/thumbnail rather than the original image.
        opts["format"] = "best"

    cookie_path = None
    try:
        cookie_opts, cookie_path = youtube_cookie_options()
        opts.update(cookie_opts)
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        outputs = [p for p in Path(temp_dir).iterdir() if p.is_file() and p.stat().st_size > 0]
        if not outputs:
            raise RuntimeError("The platform did not produce a downloadable file.")
        preferred_exts = {"video": {".mp4", ".webm", ".mkv", ".mov"}, "audio": {".mp3"}, "image": {".jpg", ".jpeg", ".png", ".webp", ".avif"}}
        matching = [p for p in outputs if p.suffix.lower() in preferred_exts[mode]]
        path = matching[0] if matching else outputs[0]
        media_types = {
            ".mp4": "video/mp4", ".webm": "video/webm", ".mkv": "video/x-matroska",
            ".mov": "video/quicktime", ".mp3": "audio/mpeg", ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
            ".avif": "image/avif",
        }
        return FileResponse(
            path,
            media_type=media_types.get(path.suffix.lower(), "application/octet-stream"),
            filename=path.name,
            background=None,
        )
    except Exception as exc:
        import shutil
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=f"Download failed: {str(exc)[:240]}")
    finally:
        if cookie_path:
            try:
                os.unlink(cookie_path)
            except OSError:
                pass
