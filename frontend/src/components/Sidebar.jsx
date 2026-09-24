import { useMemo, useState } from "react";
import { Check, Info, Library, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import Crest from "./Crest";
import { groupByDay } from "../format";

function ChatItem({ chat, active, onSelect, onRename, onDelete }) {
  const [mode, setMode] = useState("view"); // "view" | "rename" | "delete"
  const [draft, setDraft] = useState(chat.title);

  function startRename() {
    setDraft(chat.title);
    setMode("rename");
  }

  function finishRename() {
    onRename(chat.id, draft);
    setMode("view");
  }

  function onRenameKeyDown(event) {
    if (event.key === "Enter") finishRename();
    if (event.key === "Escape") setMode("view");
  }

  if (mode === "rename") {
    return (
      <li className="chat-item">
        <input
          className="chat-rename"
          name="chat-name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onRenameKeyDown}
          onBlur={finishRename}
          aria-label="Chat name"
          maxLength={80}
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      </li>
    );
  }

  return (
    <li className="chat-item" data-active={active}>
      <button className="chat-link" onClick={() => onSelect(chat.id)} aria-current={active ? "true" : undefined}>
        {chat.title}
      </button>

      {mode === "delete" ? (
        <div className="chat-tools chat-tools-open">
          <button className="tool-btn danger" onClick={() => onDelete(chat.id)} aria-label={`Confirm delete ${chat.title}`}>
            <Check size={16} />
          </button>
          <button className="tool-btn" onClick={() => setMode("view")} aria-label="Cancel delete">
            <X size={16} />
          </button>
        </div>
      ) : (
        <div className="chat-tools">
          <button className="tool-btn" onClick={startRename} aria-label={`Rename ${chat.title}`}>
            <Pencil size={15} />
          </button>
          <button className="tool-btn" onClick={() => setMode("delete")} aria-label={`Delete ${chat.title}`}>
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </li>
  );
}

function matchesSearch(chat, query) {
  return chat.title.toLowerCase().includes(query) || chat.messages.some((m) => m.content.toLowerCase().includes(query));
}

export default function Sidebar({
  open,
  conversations,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onClearAll,
  onClose,
  onOpenKnowledge,
  onOpenAbout,
}) {
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const groups = useMemo(
    () => groupByDay(query ? conversations.filter((chat) => matchesSearch(chat, query)) : conversations),
    [conversations, query],
  );

  return (
    <>
      <div className="scrim" data-open={open} onClick={onClose} aria-hidden="true" />
      <aside id="sidebar" className="sidebar" data-open={open} inert={open ? undefined : ""} aria-label="Conversations">
        <div className="brand">
          <span className="brand-mark">
            <Crest height={34} />
          </span>
          <div>
            <p className="brand-name">University of Ibadan</p>
            <p className="brand-sub">Postgraduate Assistant</p>
          </div>
        </div>

        <button className="new-chat" onClick={onNew}>
          <Plus size={18} />
          New chat
        </button>

        {conversations.length > 0 && (
          <label className="search-box">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              name="chat-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
            />
          </label>
        )}

        <nav className="chat-list-wrap" aria-label="Chat history">
          {conversations.length === 0 && <p className="chat-empty">Your conversations will appear here.</p>}
          {conversations.length > 0 && groups.length === 0 && <p className="chat-empty">No chats match “{search}”.</p>}

          {groups.map((group) => (
            <section key={group.label} className="chat-group">
              <h3>{group.label}</h3>
              <ul className="chat-list">
                {group.items.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    active={chat.id === activeId}
                    onSelect={onSelect}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            </section>
          ))}
        </nav>

        <div className="sidebar-foot">
          <button className="foot-btn" onClick={onOpenKnowledge}>
            <Library size={16} />
            Knowledge base
          </button>
          <button className="foot-btn" onClick={onOpenAbout}>
            <Info size={16} />
            About this assistant
          </button>

          {conversations.length > 0 &&
            (confirmingClear ? (
              <div className="clear-confirm">
                <span>Delete every chat?</span>
                <button
                  className="text-btn danger"
                  onClick={() => {
                    onClearAll();
                    setConfirmingClear(false);
                  }}
                >
                  Delete all
                </button>
                <button className="text-btn" onClick={() => setConfirmingClear(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <button className="foot-btn" onClick={() => setConfirmingClear(true)}>
                <Trash2 size={16} />
                Clear all conversations
              </button>
            ))}
        </div>
      </aside>
    </>
  );
}
