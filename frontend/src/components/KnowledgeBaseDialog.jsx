import { useState } from "react";
import { Search } from "lucide-react";
import Dialog from "./Dialog";
import { documentKind } from "../documentKinds";

function countLabel(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export default function KnowledgeBaseDialog({ open, onClose, docs }) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const visible = docs.documents.filter((doc) => doc.name.toLowerCase().includes(query));

  return (
    <Dialog open={open} onClose={onClose} title="Knowledge base" variant="side">
      <p className="dialog-lead">
        The assistant answers only from these official documents
        {docs.status === "ready" && ` (${docs.documents.length} documents, ${docs.totalChunks} indexed passages)`}.
      </p>

      {docs.status === "loading" && <p className="dialog-note">Loading the document list…</p>}
      {docs.status === "failed" && (
        <p className="dialog-note">The document list is not available right now. The assistant itself may still work.</p>
      )}

      {docs.documents.length > 0 && (
        <>
          <label className="filter-box">
            <Search size={16} aria-hidden="true" />
            <input
              type="search"
              name="document-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter documents"
              aria-label="Filter documents"
            />
          </label>

          <ul className="doc-list">
            {visible.map((doc) => {
              const kind = documentKind(doc.name);
              const Icon = kind.icon;
              return (
                <li key={doc.name} className="doc-item">
                  <span className="doc-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div>
                    <p className="doc-name">{doc.name}</p>
                    <p className="doc-meta">
                      {kind.label}
                      {doc.pages != null && ` · ${countLabel(doc.pages, "page")}`} · {countLabel(doc.chunks, "passage")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
          {visible.length === 0 && <p className="dialog-note">No document matches “{filter}”.</p>}
        </>
      )}
    </Dialog>
  );
}
