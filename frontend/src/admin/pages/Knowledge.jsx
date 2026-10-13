import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, FileText, Settings2, UploadCloud } from "lucide-react";
import { api } from "../adminApi";
import { Card, Chip, formatDateTime, PageHead, useAdminData, useNotice } from "../ui";
import DocumentDialog from "./DocumentDialog";

const ACCEPT = ".pdf,.docx,.html,.htm,.md,.txt";
const STATUS_TONE = { ready: "ok", processing: "info", failed: "bad" };
const STATUS_LABEL = { ready: "Ready", processing: "Processing…", failed: "Failed" };

export default function Knowledge() {
  const { data, loading, error, reload } = useAdminData("/documents");
  const [notice, say] = useNotice();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filter, setFilter] = useState("");
  const [openId, setOpenId] = useState(null);
  const fileInput = useRef(null);

  const documents = data?.documents ?? [];
  const processing = documents.some((d) => d.status === "processing");

  // Keep checking while any document is still being read.
  useEffect(() => {
    if (!processing) return undefined;
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, [processing, reload]);

  async function upload(fileList) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const form = new FormData();
    files.forEach((file) => form.append("files", file));
    setUploading(true);
    try {
      const result = await api("/documents", { method: "POST", form });
      if (result.errors.length) say(result.errors.join(" "), "error");
      else say(`${result.documents.length} document${result.documents.length === 1 ? "" : "s"} uploaded. Reading them now.`);
      reload();
    } catch (failure) {
      say(failure.message, "error");
    }
    setUploading(false);
  }

  async function toggleActive(doc) {
    try {
      await api(`/documents/${doc.id}`, { method: "PATCH", body: { active: !doc.active } });
      say(doc.active ? `${doc.name} is hidden from the assistant.` : `${doc.name} is back in use.`);
      reload();
    } catch (failure) {
      say(failure.message, "error");
    }
  }

  const query = filter.trim().toLowerCase();
  // Documents still being read, or that failed, come first so a new upload is easy to find.
  const attention = (d) => (d.status === "ready" ? 1 : 0);
  const visible = documents.filter((d) => d.name.toLowerCase().includes(query)).sort((x, y) => attention(x) - attention(y));
  const openDocument = documents.find((d) => d.id === openId) ?? null;

  return (
    <>
      <PageHead title="Documents">
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter documents" aria-label="Filter documents" />
      </PageHead>
      {notice}

      <div
        className="admin-drop"
        data-active={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          upload(e.dataTransfer.files);
        }}
      >
        <UploadCloud size={28} aria-hidden="true" />
        <p>
          <strong>Drop files here</strong> or{" "}
          <button className="admin-link" onClick={() => fileInput.current.click()} disabled={uploading}>
            choose files
          </button>
        </p>
        <p className="admin-hint">PDF, Word, HTML, Markdown or text, up to 10 MB each. Changes reach students within a minute.</p>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {error && <p className="admin-error">{error}</p>}
      {loading && <p className="admin-empty">Loading…</p>}

      <Card className="admin-flush">
        <ul className="admin-docs">
          {visible.map((doc) => (
            <li key={doc.id} data-hidden={!doc.active}>
              <span className="admin-doc-icon" aria-hidden="true">
                <FileText size={18} />
              </span>
              <div className="admin-doc-main">
                <p className="admin-doc-name">{doc.name}</p>
                <p className="admin-hint">
                  {doc.category}
                  {doc.pages != null && ` · ${doc.pages} page${doc.pages === 1 ? "" : "s"}`}
                  {doc.status === "ready" && ` · ${doc.chunks} passage${doc.chunks === 1 ? "" : "s"}`}
                  {` · updated ${formatDateTime(doc.updated)}`}
                </p>
                {doc.status === "failed" && doc.error && <p className="admin-error-text">{doc.error}</p>}
                {doc.needs_ocr_pages > 0 && doc.status !== "failed" && (
                  <p className="admin-warn-text">{doc.needs_ocr_pages} page(s) have no readable text (scanned).</p>
                )}
              </div>
              <div className="admin-doc-side">
                <Chip tone={STATUS_TONE[doc.status]}>{STATUS_LABEL[doc.status]}</Chip>
                {!doc.active && <Chip tone="warn">Hidden</Chip>}
              </div>
              <div className="admin-doc-actions">
                <button className="admin-icon-btn" onClick={() => toggleActive(doc)} aria-label={doc.active ? `Hide ${doc.name}` : `Show ${doc.name}`} title={doc.active ? "Hide from the assistant" : "Use in the assistant"}>
                  {doc.active ? <Eye size={17} /> : <EyeOff size={17} />}
                </button>
                <button className="admin-icon-btn" onClick={() => setOpenId(doc.id)} aria-label={`Manage ${doc.name}`} title="Manage">
                  <Settings2 size={17} />
                </button>
              </div>
            </li>
          ))}
        </ul>
        {!loading && visible.length === 0 && <p className="admin-empty">{documents.length === 0 ? "No documents yet. Upload the first one above." : `No document matches “${filter}”.`}</p>}
      </Card>

      <DocumentDialog
        doc={openDocument}
        categories={data?.categories ?? []}
        onClose={() => setOpenId(null)}
        onChanged={reload}
        say={say}
      />
    </>
  );
}
