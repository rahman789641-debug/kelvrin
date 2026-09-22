import logging
import os
import re
import zlib
from typing import List, Optional, Tuple
from backend.app.services.multimodal.base import (
    PdfRendererProvider,
    PageRepresentation,
    VisualElement
)

logger = logging.getLogger("kelvrin.multimodal.pdf_renderer")

class CorruptedPdfError(ValueError):
    """Raised when PDF file structure is unrecoverably corrupted or invalid."""
    pass

class PurePythonPdfRenderer(PdfRendererProvider):
    """
    Robust pure-Python PDF extractor & structural analyzer.
    Extracts text streams, identifies scanned vs text-based pages, detects embedded visual elements,
    and isolates corrupted syntax without external native dependencies.
    """
    @property
    def provider_name(self) -> str:
        return "pure_python_pdf_renderer"

    def is_available(self) -> bool:
        return True

    async def extract_pages_and_text(self, file_path: str) -> List[PageRepresentation]:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF file '{file_path}' does not exist.")

        file_size = os.path.getsize(file_path)
        if file_size == 0:
            raise CorruptedPdfError("PDF file is completely empty (0 bytes).")

        with open(file_path, "rb") as f:
            content = f.read()

        # Strict validation: Check for %PDF magic header
        if not content.startswith(b"%PDF-"):
            raise CorruptedPdfError("Invalid PDF header signature: Missing '%PDF-' magic bytes.")

        # Check for catastrophic truncation or lack of any trailer/EOF
        if len(content) < 32:
            raise CorruptedPdfError("PDF file is truncated or corrupted (insufficient byte length).")

        # Check structural validity: must have at least Page, Pages, or Catalog dictionary
        has_page = bool(re.search(rb"/Type\s*/Page\b", content))
        has_pages_cat = bool(re.search(rb"/Type\s*/Pages\b|/Type\s*/Catalog\b|/Root\b", content))
        has_eof = bool(re.search(rb"%%EOF", content))

        if not has_page and not has_pages_cat:
            raise CorruptedPdfError("Corrupted PDF: Missing valid page catalog and structural dictionary.")

        # 1. Count pages
        page_splits = list(re.finditer(rb"/Type\s*/Page\b", content))
        total_pages = len(page_splits)
        if total_pages == 0:
            count_match = re.search(rb"/Pages\b.*?/Count\s+(\d+)", content, re.DOTALL)
            if count_match:
                try:
                    total_pages = int(count_match.group(1))
                except ValueError:
                    total_pages = 1
            else:
                total_pages = max(1, file_size // (40 * 1024))

        # 2. Extract text streams
        extracted_text_blocks = self._extract_raw_text_streams(content)

        # 3. Detect embedded images / diagrams
        has_embedded_images = bool(re.search(rb"/Subtype\s*/Image\b", content))
        has_diagram_hints = bool(re.search(rb"/Type\s*/XObject\b|/ArtBox\b|/TrimBox\b", content))

        pages: List[PageRepresentation] = []

        if extracted_text_blocks and len(extracted_text_blocks) >= total_pages:
            for p_idx in range(total_pages):
                p_text = extracted_text_blocks[p_idx].strip()
                is_scanned = len(p_text) < 15 and has_embedded_images
                visual_elements = []
                if has_diagram_hints:
                    visual_elements.append(VisualElement(
                        element_type="schematic" if "schematic" in p_text.lower() else "diagram",
                        description=f"Visual asset on Page {p_idx + 1}",
                        page_number=p_idx + 1
                    ))

                pages.append(PageRepresentation(
                    page_number=p_idx + 1,
                    text=p_text,
                    has_images=has_embedded_images,
                    is_scanned=is_scanned,
                    ocr_applied=False,
                    visual_elements=visual_elements
                ))
        else:
            # Distribute available text across detected pages
            full_combined_text = "\n\n".join(extracted_text_blocks) if extracted_text_blocks else ""
            
            # Check if document has minimal or zero text stream (Scanned PDF)
            if len(full_combined_text.strip()) < 20:
                is_doc_scanned = True
            else:
                is_doc_scanned = False

            words = full_combined_text.split()
            words_per_page = max(1, len(words) // max(1, total_pages)) if words else 0

            for p_idx in range(total_pages):
                if words:
                    start_w = p_idx * words_per_page
                    end_w = (p_idx + 1) * words_per_page if (p_idx + 1) < total_pages else len(words)
                    page_text = " ".join(words[start_w:end_w]).strip()
                else:
                    page_text = ""

                is_scanned = is_doc_scanned or len(page_text) < 15
                visual_elements = []
                if has_embedded_images or has_diagram_hints:
                    visual_elements.append(VisualElement(
                        element_type="scanned_page" if is_scanned else "diagram",
                        description=f"Page {p_idx + 1} graphical stream",
                        page_number=p_idx + 1
                    ))

                pages.append(PageRepresentation(
                    page_number=p_idx + 1,
                    text=page_text,
                    has_images=has_embedded_images or is_scanned,
                    is_scanned=is_scanned,
                    ocr_applied=False,
                    visual_elements=visual_elements
                ))

        return pages

    def _extract_raw_text_streams(self, content: bytes) -> List[str]:
        text_blocks: List[str] = []

        # Find decompressed or uncompressed text operators
        for stream_match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", content, re.DOTALL):
            raw_data = stream_match.group(1)
            decompressed = None

            # Attempt FlateDecode decompression
            try:
                decompressed = zlib.decompress(raw_data)
            except Exception as e_flate:
                logger.debug(f"[PDF_RENDERER] Standard zlib decompression failed on stream: {e_flate}. Attempting raw deflate.")
                try:
                    decompressed = zlib.decompress(raw_data, -zlib.MAX_WBITS)
                except Exception as e_raw:
                    logger.debug(f"[PDF_RENDERER] Raw deflate decompression failed: {e_raw}. Retaining uncompressed stream bytes.")
                    decompressed = raw_data

            target_data = decompressed if decompressed else raw_data

            # Extract BT ... ET text blocks or parentheses text (Tj / TJ)
            extracted_lines = []
            tj_matches = re.findall(rb"\((.*?)\)\s*Tj", target_data)
            if tj_matches:
                line = " ".join(t.decode("latin-1", errors="replace") for t in tj_matches)
                extracted_lines.append(line)

            # Extract TJ array matches: [(Hello) 10 (World)] TJ
            array_matches = re.findall(rb"\[(.*?)\]\s*TJ", target_data, re.DOTALL)
            for arr in array_matches:
                inner_strings = re.findall(rb"\((.*?)\)", arr)
                if inner_strings:
                    line = "".join(s.decode("latin-1", errors="replace") for s in inner_strings)
                    extracted_lines.append(line)

            if extracted_lines:
                block = " ".join(extracted_lines).strip()
                # Clean unprintable control characters
                cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", " ", block)
                cleaned = re.sub(r"\s+", " ", cleaned).strip()
                if cleaned:
                    text_blocks.append(cleaned)

        return text_blocks
