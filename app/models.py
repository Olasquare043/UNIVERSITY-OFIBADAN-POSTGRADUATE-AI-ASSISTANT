"""Database tables."""
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, LargeBinary, String, Text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def now() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(300), unique=True)  # the name students see in citations
    filename: Mapped[str] = mapped_column(String(300))
    category: Mapped[str] = mapped_column(String(60), default="general")
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing | ready | failed
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    pages: Mapped[int | None] = mapped_column(Integer, nullable=True)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    needs_ocr_pages: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(Text, default="")
    original: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)  # only for small files
    content_type: Mapped[str] = mapped_column(String(100), default="")
    uploaded_by: Mapped[str] = mapped_column(String(200), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)

    page_rows: Mapped[list["PageText"]] = relationship(cascade="all, delete-orphan", back_populates="document")
    chunks: Mapped[list["Chunk"]] = relationship(cascade="all, delete-orphan", back_populates="document")


class PageText(Base):
    __tablename__ = "pages"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    page_number: Mapped[int] = mapped_column(Integer, default=0)  # 0 when the source has no pages
    text: Mapped[str] = mapped_column(Text)

    document: Mapped[Document] = relationship(back_populates="page_rows")


class Chunk(Base):
    __tablename__ = "chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    page: Mapped[int] = mapped_column(Integer, default=0)
    text: Mapped[str] = mapped_column(Text)
    search_text: Mapped[str] = mapped_column(Text)
    embedding: Mapped[bytes] = mapped_column(LargeBinary)  # float32 vector
    embedding_model: Mapped[str] = mapped_column(String(100))

    document: Mapped[Document] = relationship(back_populates="chunks")


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(100), primary_key=True)
    value: Mapped[object] = mapped_column(JSON)


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(200), unique=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    password_hash: Mapped[str] = mapped_column(String(300))
    role: Mapped[str] = mapped_column(String(20), default="editor")  # super_admin | editor
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class QueryLog(Base):
    __tablename__ = "query_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    question: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(String(120), default="")
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    answered: Mapped[bool] = mapped_column(Boolean, default=True)  # False when nothing relevant was found
    top_score: Mapped[float] = mapped_column(Float, default=0.0)
    cited: Mapped[list] = mapped_column(JSON, default=list)
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)  # an admin has dealt with this gap


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True)
    query_log_id: Mapped[int] = mapped_column(ForeignKey("query_logs.id", ondelete="CASCADE"), index=True)
    value: Mapped[str] = mapped_column(String(10))  # up | down
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)
    admin: Mapped[str] = mapped_column(String(200))
    action: Mapped[str] = mapped_column(String(80))
    target: Mapped[str] = mapped_column(String(300), default="")
