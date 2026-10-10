import { useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import Dialog from "./Dialog";
import { documentKind } from "../documentKinds";

function updatedLabel(date) {
  return new Date(date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function KnowledgeBaseDialog({ open, onClose, docs }) {
  const [filter, setFilter] = useState("");
  const query = filter.trim().toLowerCase();
  const visible = docs.documents.filter((doc) => doc.name.toLowerCase().includes(query));

  return (
    <Dialog open={open} onClose={onClose} title="Official documents" variant="side">
      <p className="dialog-lead">The assistant answers only from these documents.</p>

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
                <li key={doc.id} className="doc-item">
                  <span className="doc-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div className="doc-text">
                    <p className="doc-name">{doc.name}</p>
                    <p className="doc-meta">
                      {doc.category} · Updated {updatedLabel(doc.updated)}
                    </p>
                  </div>
                  {doc.has_file && (
                    <a
                      className="doc-open"
                      href={`/api/documents/${doc.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Open ${doc.name}`}
                      title="Open the document"
                    >
                      <ExternalLink size={16} />
                    </a>
                  )}
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
