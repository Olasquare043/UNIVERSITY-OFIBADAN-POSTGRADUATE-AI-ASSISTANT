"""Strip PDF extraction noise while keeping the wording intact."""
import re

_PAGE_NUMBER_LINE = re.compile(r"^\s*(page\s+)?\d{1,4}(\s*(of|/)\s*\d{1,4})?\s*$", re.IGNORECASE)
_MULTI_BLANK_LINES = re.compile(r"\n{3,}")
_MULTI_SPACES = re.compile(r"[ \t]{2,}")
_HYPHEN_LINE_BREAK = re.compile(r"(\w)-\n(\w)")  # "post-\ngraduate" -> "postgraduate"


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = _HYPHEN_LINE_BREAK.sub(r"\1\2", text)

    lines = [line for line in text.split("\n") if not _PAGE_NUMBER_LINE.match(line)]
    text = "\n".join(lines)

    text = _MULTI_SPACES.sub(" ", text)
    text = _MULTI_BLANK_LINES.sub("\n\n", text)
    return text.strip()
