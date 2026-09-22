from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Union

@dataclass
class OcrResult:
    text: str
    confidence: float = 1.0
    words_detected: int = 0
    execution_time_ms: float = 0.0
    provider_used: str = "local"
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VisionResult:
    description: str
    category: str  # DIAGRAM, ENGINEERING_DRAWING, SCHEMATIC, PHOTOGRAPHED_DOCUMENT, SCANNED_PAGE, GENERAL_IMAGE
    detected_labels: List[str] = field(default_factory=list)
    confidence: float = 0.95
    bounding_boxes: List[Dict[str, Any]] = field(default_factory=list)
    execution_time_ms: float = 0.0
    provider_used: str = "local"
    details: Dict[str, Any] = field(default_factory=dict)

@dataclass
class VisualElement:
    element_type: str  # diagram, schematic, drawing, table, chart, photo
    description: str
    page_number: int = 1
    bounding_box: Optional[Dict[str, Any]] = None
    confidence: float = 0.9

@dataclass
class PageRepresentation:
    page_number: int
    text: str
    has_images: bool = False
    is_scanned: bool = False
    ocr_applied: bool = False
    visual_elements: List[VisualElement] = field(default_factory=list)

@dataclass
class NormalizedDocument:
    document_id: str
    title: str
    filename: str
    total_pages: int
    pages: List[PageRepresentation]
    full_text: str
    visual_summaries: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

class OcrProvider(ABC):
    """Abstract sovereign on-premises OCR provider."""
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @abstractmethod
    async def extract_text(
        self,
        target: Union[str, bytes],
        mime_type: str = "image/png",
        lang: str = "eng"
    ) -> OcrResult:
        pass

class VisionProvider(ABC):
    """Abstract sovereign on-premises Vision and Multimodal provider."""
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @abstractmethod
    async def analyze_image(
        self,
        target: Union[str, bytes],
        mime_type: str = "image/png",
        prompt: Optional[str] = None
    ) -> VisionResult:
        pass

class PdfRendererProvider(ABC):
    """Abstract sovereign PDF page renderer and text/image stream extractor."""
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def is_available(self) -> bool:
        pass

    @abstractmethod
    async def extract_pages_and_text(self, file_path: str) -> List[PageRepresentation]:
        pass
