import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";

const VISIBLE_SOURCES = 4;

function uniqueSources(sources) {
  const seen = new Set();
  return sources.filter((source) => {
    const key = `${source.document}|${source.page ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function Sources({ sources, onOpen }) {
  const [expanded, setExpanded] = useState(false);
  const items = uniqueSources(sources);
  const hidden = items.length - VISIBLE_SOURCES;
  const shown = expanded || hidden <= 0 ? items : items.slice(0, VISIBLE_SOURCES);

  return (
    <div className="sources">
      <span className="sources-label">Sources ({items.length})</span>
      <ul className="sources-list">
        {shown.map((source) => (
          <li key={`${source.document}|${source.page ?? ""}`}>
            <button
              className="source-chip"
              onClick={() => onOpen(source)}
              title="Show the passage"
              aria-label={`${source.document}${source.page != null ? `, page ${source.page}` : ""}. Show passage`}
            >
              <FileText size={14} aria-hidden="true" />
              <span className="source-name">{source.document}</span>
              {source.page != null && <span className="source-page">p.{source.page}</span>}
            </button>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button className="sources-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {expanded ? "Show fewer" : `${hidden} more`}
          <ChevronDown size={14} data-flipped={expanded} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
