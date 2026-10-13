import { useState } from "react";
import { Search } from "lucide-react";
import { api } from "../adminApi";
import { Card, Chip, PageHead, useNotice } from "../ui";

export default function Playground() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, say] = useNotice();

  async function run(event) {
    event.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults((await api("/search", { method: "POST", body: { query, top_k: 8 } })).results);
    } catch (error) {
      say(error.message, "error");
    }
    setBusy(false);
  }

  return (
    <>
      <PageHead title="Test search" />
      <Card hint="Type a question to see which passages the assistant would read to answer it. This does not use the language model, so it costs nothing.">
        <form className="admin-searchbar" onSubmit={run}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="For example: How many copies of my thesis must I submit?" aria-label="Question" />
          <button className="admin-btn admin-btn-primary" disabled={busy || !query.trim()}>
            <Search size={16} aria-hidden="true" />
            Search
          </button>
        </form>
        {notice}
      </Card>

      {results && results.length === 0 && <p className="admin-empty">Nothing was found. The documents may not cover this question.</p>}

      {results?.map((result, i) => (
        <Card key={i} className="admin-result">
          <div className="admin-result-head">
            <strong>
              {result.source}
              {result.page != null && ` · page ${result.page}`}
            </strong>
            <span>
              {result.found_by.map((name) => (
                <Chip key={name} tone="info">
                  {name === "meaning" ? "matched by meaning" : "matched by keywords"}
                </Chip>
              ))}
              {result.similarity != null && <Chip>{`similarity ${result.similarity}`}</Chip>}
            </span>
          </div>
          <p className="admin-passage">{result.text}</p>
        </Card>
      ))}
    </>
  );
}
