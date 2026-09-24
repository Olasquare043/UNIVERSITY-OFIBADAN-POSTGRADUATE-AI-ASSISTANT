import Dialog from "./Dialog";
import { documentKind } from "../documentKinds";

export default function SourceDialog({ source, onClose }) {
  const kind = source ? documentKind(source.document) : null;
  const Icon = kind?.icon;

  return (
    <Dialog open={source !== null} onClose={onClose} title="Source" variant="side">
      {source && (
        <>
          <div className="doc-item">
            <span className="doc-icon" aria-hidden="true">
              <Icon size={18} />
            </span>
            <div>
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
        </>
      )}
    </Dialog>
  );
}
