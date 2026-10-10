"""Admin: manage the documents the assistant answers from."""
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import config
from app.db import get_session
from app.ingest.naming import CATEGORY_NAMES
from app.models import Admin, Chunk, Document, PageText
from app.rag.retriever import explain
from app.services import auth, kb
from app.vectorstore import reset_index

router = APIRouter(prefix="/api/admin", dependencies=[Depends(auth.current_admin)])


def _summary(d: Document) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "filename": d.filename,
        "category": d.category,
        "status": d.status,
        "active": d.active,
        "pages": d.pages,
        "chunks": d.chunk_count,
        "needs_ocr_pages": d.needs_ocr_pages,
        "error": d.error,
        "has_file": d.original is not None,
        "uploaded_by": d.uploaded_by,
        "updated": d.updated_at.isoformat(),
    }


def _get(session: Session, document_id: int) -> Document:
    document = session.get(Document, document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found.")
    return document


@router.get("/documents")
def list_documents(session: Session = Depends(get_session)) -> dict:
    rows = session.scalars(select(Document).order_by(Document.name)).all()
    return {"documents": [_summary(d) for d in rows], "categories": CATEGORY_NAMES}


@router.post("/documents")
async def upload_documents(
    files: list[UploadFile] = File(...),
    category: str = Form(""),
    admin: Admin = Depends(auth.current_admin),
    session: Session = Depends(get_session),
) -> dict:
    created, errors = [], []
    for upload in files:
        try:
            data = await upload.read()
            document = kb.create_upload(session, upload.filename or "", data, admin.email, category or None)
            auth.audit(session, admin, "uploaded document", document.name)
            created.append(document)
        except kb.UploadError as error:
            errors.append(str(error))
    session.commit()  # the background job reads these rows, so they must be saved first
    for document in created:
        kb.process_document_in_background(document.id)
    return {"documents": [_summary(d) for d in created], "errors": errors}


@router.post("/documents/{document_id}/replace")
async def replace_document(
    document_id: int,
    file: UploadFile = File(...),
    admin: Admin = Depends(auth.current_admin),
    session: Session = Depends(get_session),
) -> dict:
    document = _get(session, document_id)
    data = await file.read()
    filename = file.filename or document.filename
    if not (kb.SUPPORTED_SUFFIXES & {"." + filename.rsplit(".", 1)[-1].lower()}):
        raise HTTPException(status_code=400, detail="Only PDF, Word, HTML, Markdown and text files are supported.")
    if len(data) > config.MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"Files can be at most {config.MAX_UPLOAD_MB} MB.")

    document.filename, document.original, document.status, document.error = filename, data, "processing", ""
    session.query(Chunk).filter_by(document_id=document.id).delete()
    auth.audit(session, admin, "replaced document", document.name)
    session.commit()
    reset_index()
    kb.process_document_in_background(document.id)
    return _summary(document)


class DocumentUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    active: bool | None = None


@router.patch("/documents/{document_id}")
def update_document(
    document_id: int,
    body: DocumentUpdate,
    admin: Admin = Depends(auth.current_admin),
    session: Session = Depends(get_session),
) -> dict:
    document = _get(session, document_id)
    if body.name is not None and body.name.strip() != document.name:
        new_name = body.name.strip()
        if not new_name or session.scalar(select(Document).where(Document.name == new_name)):
            raise HTTPException(status_code=400, detail="Choose a name that is not empty and not used by another document.")
        for chunk in document.chunks:  # keep the document name in the search text in step with the new name
            chunk.search_text = chunk.search_text.replace(document.name, new_name, 1)
        auth.audit(session, admin, "renamed document", f"{document.name} -> {new_name}")
        document.name = new_name
    if body.category is not None:
        document.category = body.category
    if body.active is not None and body.active != document.active:
        document.active = body.active
        auth.audit(session, admin, "showed document" if body.active else "hid document", document.name)
    session.commit()
    reset_index()
    return _summary(document)


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, admin: Admin = Depends(auth.current_admin), session: Session = Depends(get_session)) -> dict:
    document = _get(session, document_id)
    auth.audit(session, admin, "deleted document", document.name)
    session.delete(document)
    session.commit()
    reset_index()
    return {"ok": True}


@router.get("/documents/{document_id}/pages")
def document_pages(document_id: int, session: Session = Depends(get_session)) -> dict:
    document = _get(session, document_id)
    rows = session.scalars(select(PageText).where(PageText.document_id == document_id).order_by(PageText.page_number))
    return {
        "document": _summary(document),
        "pages": [{"page": row.page_number, "text": row.text} for row in rows],
    }


class PageEdit(BaseModel):
    text: str


@router.put("/documents/{document_id}/pages/{page}")
def edit_page(
    document_id: int,
    page: int,
    body: PageEdit,
    admin: Admin = Depends(auth.current_admin),
    session: Session = Depends(get_session),
) -> dict:
    document = _get(session, document_id)
    row = session.scalar(select(PageText).where(PageText.document_id == document_id, PageText.page_number == page))
    if not row:
        raise HTTPException(status_code=404, detail="Page not found.")
    row.text = body.text
    auth.audit(session, admin, "edited page text", f"{document.name} p.{page}")
    return {"ok": True}


@router.post("/documents/{document_id}/reindex")
def reindex(document_id: int, admin: Admin = Depends(auth.current_admin), session: Session = Depends(get_session)) -> dict:
    document = _get(session, document_id)
    has_pages = session.scalar(select(PageText.id).where(PageText.document_id == document_id).limit(1))
    if not has_pages:
        raise HTTPException(status_code=400, detail="This document has no saved page text. Replace the file to re-read it.")
    auth.audit(session, admin, "re-indexed document", document.name)
    session.commit()
    kb.reindex_document(document_id)
    session.refresh(document)
    return _summary(document)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 8


@router.post("/search")
def playground(body: SearchRequest) -> dict:
    """Show what the assistant would find for a question, without calling the language model."""
    return {"results": explain(body.query, max(1, min(body.top_k, 20)))}
