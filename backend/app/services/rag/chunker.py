import math
import re
from dataclasses import dataclass, field
from typing import List, Dict, Any
from backend.app.services.multimodal.base import NormalizedDocument, PageRepresentation
from backend.app.services.rag.cleaner import clean_text

@dataclass
class ChunkData:
    chunk_index: int
    page_number: int
    content: str
    token_count: int
    chunk_metadata: Dict[str, Any] = field(default_factory=dict)

class StructuralChunker:
    """
    Token-aware sliding window chunker with structural page and section preservation.
    """
    def __init__(self, target_chunk_size: int = 500, chunk_overlap: int = 50):
        self.target_chunk_size = target_chunk_size
        self.chunk_overlap = chunk_overlap

    def chunk_document(self, norm_doc: NormalizedDocument) -> List[ChunkData]:
        chunks: List[ChunkData] = []
        global_chunk_idx = 0

        for page in norm_doc.pages:
            cleaned_page_text = clean_text(page.text)
            if not cleaned_page_text:
                continue

            page_chunks = self._chunk_page(
                page_text=cleaned_page_text,
                page_number=page.page_number,
                start_index=global_chunk_idx,
                visual_elements=page.visual_elements,
                doc_title=norm_doc.title
            )

            chunks.extend(page_chunks)
            global_chunk_idx += len(page_chunks)

        # Edge case: if document has no text across all pages, create a single asset metadata chunk
        if not chunks:
            summary = norm_doc.visual_summaries[0]["description"] if norm_doc.visual_summaries else f"Sovereign document: {norm_doc.title}"
            chunks.append(ChunkData(
                chunk_index=0,
                page_number=1,
                content=f"[DOCUMENT ASSET SUMMARY: {norm_doc.title}]\n{summary}",
                token_count=len(summary.split()),
                chunk_metadata={"doc_title": norm_doc.title, "is_summary": True}
            ))

        return chunks

    def _chunk_page(
        self,
        page_text: str,
        page_number: int,
        start_index: int,
        visual_elements: List[Any],
        doc_title: str
    ) -> List[ChunkData]:
        # Split into sentences or paragraphs
        paragraphs = [p.strip() for p in page_text.split("\n\n") if p.strip()]
        if not paragraphs:
            paragraphs = [page_text]

        words: List[str] = []
        for p in paragraphs:
            words.extend(p.split())

        total_words = len(words)
        if total_words == 0:
            return []

        # Convert target chunk size in tokens to approximate word count (~0.75 words per token)
        words_per_chunk = max(20, int(self.target_chunk_size * 0.75))
        words_overlap = max(5, int(self.chunk_overlap * 0.75))

        chunks: List[ChunkData] = []
        current_idx = start_index

        step = max(1, words_per_chunk - words_overlap)
        i = 0
        while i < total_words:
            chunk_words = words[i:i + words_per_chunk]
            chunk_text = " ".join(chunk_words)

            # Estimate token count
            tokens = math.ceil(len(chunk_words) * 1.3)

            meta = {
                "doc_title": doc_title,
                "page_number": page_number,
                "has_visuals": bool(visual_elements),
                "visual_types": [v.element_type for v in visual_elements] if visual_elements else []
            }

            chunks.append(ChunkData(
                chunk_index=current_idx,
                page_number=page_number,
                content=chunk_text,
                token_count=tokens,
                chunk_metadata=meta
            ))

            current_idx += 1
            i += step

            # If remaining words are smaller than overlap, stop
            if i >= total_words:
                break

        return chunks

# Singleton instance
chunker = StructuralChunker()
