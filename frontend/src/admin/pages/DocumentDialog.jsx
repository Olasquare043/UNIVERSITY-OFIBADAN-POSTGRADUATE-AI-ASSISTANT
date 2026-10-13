import { useEffect, useRef, useState } from "react";
import Dialog from "../../components/Dialog";
import { api } from "../adminApi";
import { ConfirmButton, Field, useNotice } from "../ui";

function Details({ doc, categories, onClose, onChanged, say }) {
  const [name, setName] = useState(doc.name);
  const [category, setCategory] = useState(doc.category);
  const replaceInput = useRef(null);

  async function save() {
    try {
      await api(`/documents/${doc.id}`, { method: "PATCH", body: { name, category } });
      say("Saved.");
      onChanged();
    } catch (error) {
      say(error.message, "error");
    }
  }

  async function replace(file) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    try {
      await api(`/documents/${doc.id}/replace`, { method: "POST", form });
      say("The new file is being read. The old version is no longer used.");
      onChanged();
      onClose();
    } catch (error) {
      say(error.message, "error");
    }
  }

  async function remove() {
    try {
      await api(`/documents/${doc.id}`, { method: "DELETE" });
      say(`${doc.name} was deleted.`);
      onChanged();
      onClose();
    } catch (error) {
      say(error.message, "error");
    }
  }

  return (
    <div className="admin-stack">
      <Field label="Name" hint="Students see this name in the sources of an answer.">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Type">
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          {[...new Set([...categories, doc.category])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <button className="admin-btn admin-btn-primary" onClick={save} disabled={!name.trim()}>
        Save changes
      </button>

      <hr className="admin-rule" />
      <p className="admin-hint">File: {doc.filename}{doc.has_file ? "" : " (the original is too large to keep, so students cannot open it)"}</p>
      <div className="admin-row">
        <button className="admin-btn" onClick={() => replaceInput.current.click()}>
          Replace with a new version
        </button>
        <input ref={replaceInput} type="file" accept=".pdf,.docx,.html,.htm,.md,.txt" hidden onChange={(e) => replace(e.target.files[0])} />
        <ConfirmButton onConfirm={remove} className="admin-btn admin-btn-danger-outline">
          Delete document
        </ConfirmButton>
      </div>
    </div>
  );
}

function PageText({ doc, onChanged, say }) {
  const [pages, setPages] = useState(null);
  const [current, setCurrent] = useState(null);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api(`/documents/${doc.id}/pages`)
      .then((data) => {
        setPages(data.pages);
        if (data.pages.length) {
          const first = data.pages.find((p) => !p.text.trim()) ?? data.pages[0];
          setCurrent(first.page);
          setText(first.text);
        }
      })
      .catch((error) => say(error.message, "error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.id]);

  function choose(page) {
    const found = pages.find((p) => p.page === page);
    setCurrent(page);
    setText(found.text);
    setDirty(false);
  }

  async function savePage() {
    try {
      await api(`/documents/${doc.id}/pages/${current}`, { method: "PUT", body: { text } });
      setPages(pages.map((p) => (p.page === current ? { ...p, text } : p)));
      setDirty(false);
      say("Page text saved. Re-index to use it.");
    } catch (error) {
      say(error.message, "error");
    }
  }

  async function reindex() {
    try {
      await api(`/documents/${doc.id}/reindex`, { method: "POST" });
      say("Re-indexed. The assistant now uses the corrected text.");
      onChanged();
    } catch (error) {
      say(error.message, "error");
    }
  }

  if (pages === null) return <p className="admin-empty">Loading…</p>;
  if (pages.length === 0) {
    return (
      <p className="admin-empty">
        The text of this document was not saved page by page, so it cannot be edited here. Use "Replace with a new version" on the Details tab to read it again.
      </p>
    );
  }

  return (
    <div className="admin-stack">
      <p className="admin-hint">Fix a misread word or type the text of a scanned page, then save and re-index. Pages with no text are marked.</p>
      <Field label="Page">
        <select value={current ?? ""} onChange={(e) => choose(Number(e.target.value))}>
          {pages.map((p) => (
            <option key={p.page} value={p.page}>
              {p.page === 0 ? "Whole document" : `Page ${p.page}`}
              {p.text.trim() ? "" : " (no text)"}
            </option>
          ))}
        </select>
      </Field>
      <textarea
        className="admin-pagetext"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setDirty(true);
        }}
        rows={14}
        aria-label="Page text"
      />
      <div className="admin-row">
        <button className="admin-btn" onClick={savePage} disabled={!dirty}>
          Save page text
        </button>
        <button className="admin-btn admin-btn-primary" onClick={reindex} disabled={dirty}>
          Re-index document
        </button>
      </div>
    </div>
  );
}

export default function DocumentDialog({ doc, categories, onClose, onChanged, say: sayOnPage }) {
  const [tab, setTab] = useState("details");
  const [notice, sayInDialog] = useNotice();

  // The page behind the dialog is hidden while it is open, so show the message in both places.
  function say(text, tone) {
    sayInDialog(text, tone);
    sayOnPage(text, tone);
  }

  useEffect(() => setTab("details"), [doc?.id]);

  return (
    <Dialog open={doc !== null} onClose={onClose} title={doc ? doc.name : "Document"} variant="side">
      {doc && (
        <>
          {notice}
          <div className="admin-tabs" role="tablist">
            {[
              ["details", "Details"],
              ["pages", "Page text"],
            ].map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} className="admin-tab" onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
          {tab === "details" ? (
            <Details doc={doc} categories={categories} onClose={onClose} onChanged={onChanged} say={say} />
          ) : (
            <PageText doc={doc} onChanged={onChanged} say={say} />
          )}
        </>
      )}
    </Dialog>
  );
}
