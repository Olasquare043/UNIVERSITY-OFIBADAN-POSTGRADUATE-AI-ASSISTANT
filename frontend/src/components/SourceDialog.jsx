import { ExternalLink } from "lucide-react";
import Dialog from "./Dialog";
import { documentKind } from "../documentKinds";

export default function SourceDialog({ source, documents, onClose }) {
  const kind = source ? documentKind(source.document) : null;
  const Icon = kind?.icon;
  const original = source && documents.find((doc) => doc.name === source.document && doc.has_file);
  const link = original && `/api/documents/${original.id}/file${source.page != null ? `#page=${source.page}` : ""}`;

  return (
    <Dialog open={source !== null} onClose={onClose} title="Source" variant="side">
      {source && (
        <>
          <div className="doc-item">
            <span className="doc-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div className="doc-text">
              <p className="doc-name">{source.document}</p>
              <p className="doc-meta">
                {kind.label}
                {source.page != null && ` · Page ${source.page}`}
              </p>
            </div>
          </div>

          {source.snippet ? (
            <figure className="snippet">
              <figcaption>Passage the answer relied on</figcaption>
              <blockquote>{source.snippet}</blockquote>
            </figure>
          ) : (
            <p className="dialog-note">No excerpt was returned for this source.</p>
          )}

          {link && (
            <a className="btn btn-primary open-original" href={link} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={16} aria-hidden="true" />
              Open the original document
            </a>
          )}
        </>
      )}
    </Dialog>
  );
}
