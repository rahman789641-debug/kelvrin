import re
import unicodedata

def clean_text(text: str) -> str:
    """
    Sovereign text sanitizer and normalizer.
    Normalizes unicode, standardizes whitespace, repairs common OCR artifacts,
    and preserves structural paragraph breaks without external cloud sanitizers.
    """
    if not text:
        return ""

    # 1. Unicode normalization (NFKC)
    normalized = unicodedata.normalize("NFKC", text)

    # 2. Normalize smart quotes, dashes, and bullets
    normalized = normalized.replace("“", "\"").replace("”", "\"")
    normalized = normalized.replace("‘", "'").replace("’", "'")
    normalized = normalized.replace("—", " - ").replace("–", " - ")
    normalized = normalized.replace("•", "* ")

    # 3. Strip unprintable control characters (keep \n, \t, \r)
    normalized = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", " ", normalized)

    # 4. Standardize line endings and collapse repeated spaces
    lines = normalized.splitlines()
    cleaned_lines = []
    for line in lines:
        cleaned_line = re.sub(r"[ \t]+", " ", line).strip()
        cleaned_lines.append(cleaned_line)

    # 5. Collapse excessive empty lines (max 2 consecutive line breaks)
    collapsed = "\n".join(cleaned_lines)
    collapsed = re.sub(r"\n{3,}", "\n\n", collapsed)

    return collapsed.strip()
