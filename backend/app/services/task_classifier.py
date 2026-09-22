import re
from dataclasses import dataclass
from typing import List, Optional
from backend.app.services.model_provider.base import ModelCapability

@dataclass
class TaskClassificationResult:
    primary_capability: ModelCapability
    required_capabilities: List[ModelCapability]
    confidence: float
    detected_intent: str
    reasoning: str
    task_type: str = "GENERAL_QA"
    requires_document: bool = False
    requires_tool: bool = False
    target_file_type: Optional[str] = None

class TaskClassifier:
    """
    On-premises sovereign task intent classifier.
    Analyzes prompt semantics, keywords, syntax patterns, and context attachments
    to determine mandatory model capabilities and structured enterprise task metadata.
    """
    FILE_GEN_PATTERNS = [
        (r"\b(powerpoint|pptx|ppt|\.pptx|\.ppt|presentation|slides|deck|slide deck)\b", "PPTX"),
        (r"\b(word|docx|doc|\.docx|\.doc|approval note|document file)\b", "DOCX"),
        (r"\b(excel|xlsx|xls|\.xlsx|\.xls|spreadsheet|sheet|grid|tabular)\b", "XLSX"),
        (r"\b(pdf|\.pdf|pdf report|pdf document)\b", "PDF"),
        (r"\b(text file|\.txt|txt file|raw text)\b", "TXT")
    ]

    CREATION_VERBS = r"\b(create|make|generate|build|export|draft|write|prepare|compile|give|provide|send|download|save|output|convert|produce|format|as)\b"

    CODING_PATTERNS = [
        r"\b(python|javascript|typescript|c\+\+|golang|rust|bash|sql|html|css|json|yaml)\b",
        r"\b(write|create|generate|implement|debug|refactor|fix|optimize)\s+(a\s+)?(code|script|function|class|algorithm|query|api|regex|method)\b",
        r"\b(def\s+\w+|function\s+\w+|class\s+\w+|import\s+\w+|const\s+\w+|SELECT\s+.*FROM)\b",
        r"\b(syntax|compiler|traceback|exception|unittest|pytest|regex|factorial|fibonacci)\b"
    ]

    VISION_PATTERNS = [
        r"\b(image|picture|photo|screenshot|diagram|blueprint|chart|graph|schematic|technical drawing)\b",
        r"\b(look at|inspect|describe|analyze|read)\s+(this\s+)?(image|photo|diagram|chart|blueprint|schematic)\b",
        r"\b(visual|multimodal)\b"
    ]

    OCR_PATTERNS = [
        r"\b(ocr|scanned|scan|handwriting|handwritten|receipt|invoice|extract text from (image|scan))\b"
    ]

    CALCULATION_PATTERNS = [
        r"\b(calculate|compute)\b",
        r"\b\d+\s*[\+\-\*\/\^%]\s*\d+",
        r"\b(math|arithmetic|square root|sum of|product of)\b",
        r"\bwhat is \d+\s*[\+\-\*\/]"
    ]

    AGENT_PATTERNS = [
        r"\bread\b.*\b(sop|standard|knowledge base)\b.*\b(prepare|create|generate)\b",
        r"\b(inspect|evaluate|audit)\b.*\b(findings|compliance)\b.*\b(approval note|report)\b",
        r"\b(read the report|check the relevant sop|consult the relevant local sop)\b"
    ]

    def classify(self, prompt: str, has_image: bool = False, modality_hint: Optional[str] = None) -> TaskClassificationResult:
        if not prompt or not prompt.strip():
            return TaskClassificationResult(
                primary_capability=ModelCapability.TEXT,
                required_capabilities=[ModelCapability.TEXT],
                confidence=1.0,
                detected_intent="EMPTY_QUERY",
                reasoning="Empty input defaulted to standard text capability.",
                task_type="GENERAL_QA",
                requires_document=False,
                requires_tool=False
            )

        text = prompt.strip()
        lower_text = text.lower()

        # 1. Check Agent Compound Task
        if any(re.search(pat, lower_text, re.IGNORECASE) for pat in self.AGENT_PATTERNS):
            return TaskClassificationResult(
                primary_capability=ModelCapability.REASONING,
                required_capabilities=[ModelCapability.REASONING, ModelCapability.TEXT],
                confidence=0.96,
                detected_intent="AUTONOMOUS_AGENT_PIPELINE",
                reasoning="Compound multi-step goal detected combining document inspection, SOP retrieval, and deliverable creation.",
                task_type="AGENT_TASK",
                requires_document=True,
                requires_tool=True
            )

        # 2. Check File Generation Intent
        has_creation_verb = bool(re.search(self.CREATION_VERBS, lower_text, re.IGNORECASE))
        for pattern, ftype in self.FILE_GEN_PATTERNS:
            if re.search(pattern, lower_text, re.IGNORECASE) and (has_creation_verb or "export" in lower_text or ftype in ["DOCX", "XLSX", "PPTX", "PDF"]):
                return TaskClassificationResult(
                    primary_capability=ModelCapability.TEXT,
                    required_capabilities=[ModelCapability.TEXT],
                    confidence=0.95,
                    detected_intent=f"FILE_GENERATION_{ftype}",
                    reasoning=f"Natural language deliverable synthesis intent recognized for {ftype} file creation.",
                    task_type="FILE_GENERATION",
                    requires_document=False,
                    requires_tool=True,
                    target_file_type=ftype
                )

        # 3. Check OCR explicit requirement
        is_ocr = any(re.search(pat, lower_text, re.IGNORECASE) for pat in self.OCR_PATTERNS)
        if is_ocr and (has_image or "image" in lower_text or "scanned" in lower_text):
            return TaskClassificationResult(
                primary_capability=ModelCapability.OCR,
                required_capabilities=[ModelCapability.OCR, ModelCapability.VISION, ModelCapability.TEXT],
                confidence=0.95,
                detected_intent="DOCUMENT_OCR_EXTRACTION",
                reasoning="OCR keywords detected with visual media payload or scanned reference.",
                task_type="OCR",
                requires_document=True,
                requires_tool=True
            )

        # 4. Check Vision explicit requirement
        is_vision = has_image or (modality_hint and modality_hint.lower() == "vision") or any(
            re.search(pat, lower_text, re.IGNORECASE) for pat in self.VISION_PATTERNS
        )
        if is_vision:
            reqs = [ModelCapability.VISION, ModelCapability.TEXT]
            if is_ocr:
                reqs.insert(1, ModelCapability.OCR)
            return TaskClassificationResult(
                primary_capability=ModelCapability.VISION,
                required_capabilities=reqs,
                confidence=0.92 if has_image else 0.88,
                detected_intent="MULTIMODAL_VISUAL_ANALYSIS",
                reasoning="Visual asset references or image attachments present in task context.",
                task_type="VISION_ANALYSIS",
                requires_document=True,
                requires_tool=True
            )

        # 5. Check Coding requirements
        code_matches = sum(1 for pat in self.CODING_PATTERNS if re.search(pat, lower_text, re.IGNORECASE))
        # Exclude pure conceptual questions like "What is Python?" from coding tool execution
        is_conceptual_python = bool(re.match(r"^(what is|explain|define|tell me about)\s+python\b", lower_text.strip()))
        if code_matches >= 1 and not is_conceptual_python:
            confidence = min(0.98, 0.70 + (code_matches * 0.10))
            return TaskClassificationResult(
                primary_capability=ModelCapability.CODING,
                required_capabilities=[ModelCapability.CODING, ModelCapability.TEXT],
                confidence=round(confidence, 2),
                detected_intent="SOFTWARE_ENGINEERING_CODING",
                reasoning=f"Code syntax and programming semantics detected ({code_matches} pattern matches).",
                task_type="CODING",
                requires_document=False,
                requires_tool=True
            )

        # 6. Check Calculation
        if any(re.search(pat, lower_text, re.IGNORECASE) for pat in self.CALCULATION_PATTERNS):
            return TaskClassificationResult(
                primary_capability=ModelCapability.REASONING,
                required_capabilities=[ModelCapability.REASONING, ModelCapability.TEXT],
                confidence=0.94,
                detected_intent="NUMERICAL_CALCULATION",
                reasoning="Mathematical calculation or arithmetic expression detected.",
                task_type="CALCULATION",
                requires_document=False,
                requires_tool=True
            )

        # 7. Check Complex Logical / Root Cause Reasoning
        if any(k in lower_text for k in ["root cause", "explain why", "deduce", "infer", "causal", "fault tree", "chain of thought", "failure analysis"]):
            return TaskClassificationResult(
                primary_capability=ModelCapability.REASONING,
                required_capabilities=[ModelCapability.REASONING, ModelCapability.TEXT],
                confidence=0.94,
                detected_intent="COMPLEX_LOGICAL_REASONING",
                reasoning="Multi-step causal deduction, root cause, or failure analysis requested.",
                task_type="DATA_ANALYSIS",
                requires_document=False,
                requires_tool=False
            )

        # 7. Check Knowledge Base Search / SOP standard query
        if any(k in lower_text for k in ["sop", "standard operating procedure", "knowledge base", "regulatory directive", "compliance standard", "sec viii", "asme"]):
            return TaskClassificationResult(
                primary_capability=ModelCapability.REASONING,
                required_capabilities=[ModelCapability.REASONING, ModelCapability.TEXT],
                confidence=0.92,
                detected_intent="KNOWLEDGE_BASE_RETRIEVAL",
                reasoning="Regulatory standard or SOP inquiry requiring grounded knowledge base retrieval.",
                task_type="KNOWLEDGE_SEARCH",
                requires_document=True,
                requires_tool=True
            )

        # 8. Check Document Summary / Document QA
        if any(k in lower_text for k in ["summarize", "summary", "digest", "briefing"]) and any(k in lower_text for k in ["report", "document", "file", "dossier", "vessel"]):
            return TaskClassificationResult(
                primary_capability=ModelCapability.REASONING,
                required_capabilities=[ModelCapability.REASONING, ModelCapability.TEXT],
                confidence=0.93,
                detected_intent="DOCUMENT_SYNTHESIS_AND_SUMMARY",
                reasoning="Grounded document summarization request.",
                task_type="DOCUMENT_SUMMARY",
                requires_document=True,
                requires_tool=False
            )

        # 9. Default: Standard General QA / Factual Explanation
        return TaskClassificationResult(
            primary_capability=ModelCapability.TEXT,
            required_capabilities=[ModelCapability.TEXT],
            confidence=0.90,
            detected_intent="GENERAL_KNOWLEDGE_QA",
            reasoning="Direct conceptual, factual, or conversational inquiry.",
            task_type="GENERAL_QA",
            requires_document=False,
            requires_tool=False
        )

# Singleton task classifier instance
task_classifier = TaskClassifier()
