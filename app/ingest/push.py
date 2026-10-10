"""Send documents from your computer to the database the website uses.

Use it for scanned PDFs: the web server has no OCR, but your computer does.

    python -m app.ingest.push path/to/scan.pdf [more files ...]   read the files (with OCR) and add or replace them
    python -m app.ingest.push --all                               import everything build_index produced

It writes to whatever DATABASE_URL points at, so put the Neon connection string in .env first.
"""
import argparse
from pathlib import Path

from sqlalchemy import select

from app import config
from app.db import init_db, session_scope
from app.ingest.clean import clean_text
from app.ingest.extract import Page, extract_pages, ocr_available
from app.ingest.naming import category_for, display_name
from app.models import Document, PageText
from app.services import kb


def push_file(file_path: Path) -> None:
    if file_path.suffix.lower() not in kb.SUPPORTED_SUFFIXES:
        raise SystemExit(f"{file_path.name}: unsupported file type")

    pages = [Page(text=clean_text(p.text), page_number=p.page_number) for p in extract_pages(file_path)]
    name = display_name(file_path)
    data = file_path.read_bytes()
    small = len(data) <= config.MAX_UPLOAD_MB * 1024 * 1024

    with session_scope() as session:
        document = session.scalar(select(Document).where(Document.name == name))
        if document:
            session.query(PageText).filter_by(document_id=document.id).delete()
        else:
            document = Document(name=name, filename=file_path.name, category=category_for(name))
            session.add(document)
        document.filename = file_path.name
        document.original = data if small else None
        document.uploaded_by = "push command"
        session.flush()
        for page in pages:
            session.add(PageText(document_id=document.id, page_number=page.page_number or 0, text=page.text))
        session.flush()
        kb._build_chunks(session, document, pages)
        print(f"  {name}: {document.status}, {document.chunk_count} passages")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="*", type=Path)
    parser.add_argument("--all", action="store_true", help="import everything build_index produced")
    args = parser.parse_args()

    init_db()
    if args.all:
        print(f"Imported {kb.import_from_files(replace=True)} documents.")
        return
    if not args.files:
        parser.error("give one or more files, or use --all")
    if not ocr_available():
        print("Tesseract is not installed here, so scanned pages will be left empty.")
    for file_path in args.files:
        push_file(file_path)


if __name__ == "__main__":
    main()
