"""
Shared upload guards (audit 2026-09-15, finding 30).

FastAPI/Starlette parse and buffer the whole multipart body before an endpoint
handler runs, so a size check inside the handler is too late to prevent the
read. UPLOAD_LIMITS therefore feeds the pure-ASGI UploadSizeGuardMiddleware
(registered in backend/main.py), which rejects oversized requests from the
Content-Length header before the body is ever consumed. The handlers still
re-check the exact byte count after streaming (chunked uploads carry no
trustworthy header) and verify the payload type from magic bytes instead of
trusting the client.
"""
from starlette.datastructures import Headers
from starlette.responses import JSONResponse

# Route path → (max_bytes, detail). Single source of truth for both the
# middleware's pre-parse check and the handlers' post-stream re-check.
UPLOAD_LIMITS: dict[str, tuple[int, str]] = {
    "/api/receipts": (20 * 1024 * 1024, "Image too large. Maximum 20MB."),
    "/api/import/csv": (5 * 1024 * 1024, "CSV file too large (max 5 MB)"),
    "/api/import/fuelio": (2 * 1024 * 1024, "File too large (max 2MB)"),
}

# Magic-byte signatures of common binary formats. The CSV endpoints accept
# text files, which have no magic bytes of their own — so "looks like text"
# is approximated as "does not start with a known binary signature".
BINARY_SIGNATURES = (
    b"\xff\xd8\xff",  # JPEG
    b"\x89\x50\x4e\x47",  # PNG
    b"%PDF",          # PDF
    b"GIF8",          # GIF
    b"PK\x03\x04",    # ZIP (also misnamed .xlsx / .docx)
    b"\x1f\x8b",      # GZIP
)

# Image types accepted by the receipt-upload endpoint, matched by signature.
_HEIC_BRANDS = (
    b"heic", b"heix", b"hevc", b"hevx", b"heif", b"heim",
    b"heis", b"hevm", b"hevs", b"mif1", b"msf1", b"mhe1", b"avif",
)


class UploadSizeGuardMiddleware:
    """Reject requests whose Content-Length already exceeds the route's
    upload limit (413) before the multipart body is parsed or buffered."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            limit = UPLOAD_LIMITS.get(scope.get("path", ""))
            if limit is not None:
                raw = Headers(scope=scope).get("content-length")
                if raw and raw.isdigit() and int(raw) > limit[0]:
                    response = JSONResponse(
                        status_code=413, content={"detail": limit[1]}
                    )
                    await response(scope, receive, send)
                    return
        await self.app(scope, receive, send)


def sniff_image_format(data: bytes) -> str | None:
    """Return the image format detected from magic bytes, or None when the
    payload is none of the allowed types (JPEG, PNG, WebP, HEIC/HEIF)."""
    if data[:3] == b"\xff\xd8\xff":
        return "jpeg"
    if data[:4] == b"\x89\x50\x4e\x47":
        return "png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    # HEIC/HEIF: ISO BMFF container — ftyp box followed by an image brand
    if data[4:8] == b"ftyp" and data[8:12] in _HEIC_BRANDS:
        return "heic"
    return None


def looks_like_binary(data: bytes) -> bool:
    """True when the payload starts with a known binary signature — used to
    reject binary files uploaded to the text (CSV) endpoints."""
    return any(data.startswith(sig) for sig in BINARY_SIGNATURES)
