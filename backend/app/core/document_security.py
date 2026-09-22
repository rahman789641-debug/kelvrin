import os
import re
from typing import Dict, List, Optional, Tuple
from fastapi import HTTPException, status
from backend.app.core.config import settings

# Supported document formats, extensions, MIME types, and magic byte prefixes
FORMAT_CONFIG: Dict[str, Dict] = {
    ".pdf": {
        "mime_types": ["application/pdf"],
        "magic_prefixes": [b"%PDF-"],
        "category": "PDF"
    },
    ".docx": {
        "mime_types": [
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/zip",
            "application/octet-stream"
        ],
        "magic_prefixes": [b"PK\x03\x04"],
        "category": "DOCX"
    },
    ".xlsx": {
        "mime_types": [
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/zip",
            "application/octet-stream"
        ],
        "magic_prefixes": [b"PK\x03\x04"],
        "category": "XLSX"
    },
    ".txt": {
        "mime_types": [
            "text/plain",
            "text/markdown",
            "application/octet-stream"
        ],
        "magic_prefixes": [],  # Validated via UTF-8 text integrity
        "category": "TXT"
    },
    ".png": {
        "mime_types": ["image/png"],
        "magic_prefixes": [b"\x89PNG\r\n\x1a\n"],
        "category": "PNG"
    },
    ".jpg": {
        "mime_types": ["image/jpeg", "image/jpg"],
        "magic_prefixes": [b"\xff\xd8\xff"],
        "category": "JPEG"
    },
    ".jpeg": {
        "mime_types": ["image/jpeg", "image/jpg"],
        "magic_prefixes": [b"\xff\xd8\xff"],
        "category": "JPEG"
    }
}

def sanitize_filename(raw_filename: str) -> str:
    r"""
    Sanitize an uploaded filename to prevent directory traversal and arbitrary file execution.
    - Strips directory path components (both UNIX / and Windows \)
    - Strips null bytes (\x00) and control characters
    - Normalizes spaces to underscores
    - Restricts to safe alphanumeric characters, underscores, dashes, and periods
    """
    if not raw_filename:
        return "sovereign_document.bin"

    # 1. Strip directory components
    base_name = os.path.basename(raw_filename.replace("\\", "/"))

    # 2. Remove null bytes and non-printable control characters
    base_name = base_name.replace("\x00", "").strip()

    # 3. Remove leading dots or slashes to prevent hidden files or root traversal
    base_name = re.sub(r"^[.\s/\\-]+", "", base_name)

    # 4. Normalize spaces and safe replacement
    safe_name = re.sub(r"[^\w\.\-]", "_", base_name)

    # 5. Prevent multiple contiguous dots (e.g. filename..pdf)
    safe_name = re.sub(r"\.{2,}", ".", safe_name)

    if not safe_name:
        return "sovereign_document.bin"

    return safe_name

def validate_file_format(
    filename: str,
    declared_content_type: Optional[str],
    header_bytes: bytes
) -> Tuple[str, str, str]:
    """
    Validates the file format against the supported whitelist using:
    1. Safe file extension
    2. Declared MIME type
    3. Magic byte signature verification

    Returns: (normalized_extension, canonical_mime, category)
    Raises: HTTPException(400) if validation fails.
    """
    _, ext = os.path.splitext(filename.lower())
    if not ext or ext not in FORMAT_CONFIG:
        allowed = ", ".join(sorted(FORMAT_CONFIG.keys()))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Allowed formats: {allowed}"
        )

    config = FORMAT_CONFIG[ext]
    canonical_mime = config["mime_types"][0]
    category = config["category"]

    # Validate declared MIME if provided
    if declared_content_type and declared_content_type != "application/octet-stream":
        norm_mime = declared_content_type.lower().split(";")[0].strip()
        if norm_mime not in config["mime_types"] and "octet-stream" not in norm_mime:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"MIME type mismatch: Declared '{norm_mime}' does not match expected for extension '{ext}'"
            )

    # Magic byte verification
    magic_prefixes = config.get("magic_prefixes", [])
    if magic_prefixes:
        matched = False
        for prefix in magic_prefixes:
            if header_bytes.startswith(prefix):
                matched = True
                break
        if not matched:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"File content spoofing detected: Header bytes do not match expected signature for {category} ({ext})"
            )
    elif ext == ".txt":
        # Validate text integrity (no binary null bytes, decodable text)
        if b"\x00" in header_bytes[:512]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Binary null bytes detected in plain text document"
            )
        try:
            header_bytes[:1024].decode("utf-8")
        except UnicodeDecodeError:
            try:
                header_bytes[:1024].decode("latin-1")
            except (UnicodeDecodeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid text encoding in uploaded document"
                )

    return ext, canonical_mime, category

def validate_file_size(size_bytes: int, max_bytes: int = settings.MAX_UPLOAD_SIZE_BYTES) -> None:
    """
    Enforces maximum file size limits on incoming uploads.
    """
    if size_bytes <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file uploads are not permitted"
        )
    if size_bytes > max_bytes:
        max_mb = max_bytes / (1024 * 1024)
        status_code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
        raise HTTPException(
            status_code=status_code,
            detail=f"File exceeds maximum permissible upload size of {max_mb:.1f} MB"
        )

def assert_path_confined(target_path: str, storage_root: Optional[str] = None) -> str:
    """
    Strictly verifies that target_path resides within the authorized storage directory.
    Prevents directory traversal and symlink poisoning attacks.
    """
    root = os.path.abspath(storage_root or settings.absolute_storage_path)
    abs_target = os.path.abspath(target_path)

    try:
        common = os.path.commonpath([abs_target, root])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security violation: Cross-drive or invalid path access detected"
        )

    if common != root:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Security violation: Path traversal outside sovereign vault denied"
        )

    return abs_target
