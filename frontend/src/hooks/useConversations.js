import { useEffect, useRef, useState } from "react";
import { askAssistant } from "../api";
import { createPacer } from "../pacer";
import { CONVERSATIONS_KEY, readJSON, writeJSON } from "../storage";

const HISTORY_LIMIT = 6;
const TITLE_LIMIT = 40;

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function makeTitle(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > TITLE_LIMIT ? clean.slice(0, TITLE_LIMIT).trimEnd() + "…" : clean;
}

// Assistant messages carry state: "done", "stopped" or "failed".
// Older saved chats flagged failures with `error: true` and stored the notice as content.
function upgradeMessage(message) {
  if (message.role === "assistant" && !message.state) {
    return message.error ? { ...message, content: "", state: "failed" } : { ...message, state: "done" };
  }
  return message;
}

function loadConversations() {
  const saved = readJSON(CONVERSATIONS_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.map((chat) => ({ ...chat, messages: (chat.messages || []).map(upgradeMessage) }));
}

// Only finished answers go back to the API as context.
function toHistory(messages) {
  return messages
    .filter((m) => m.role === "user" || m.state === "done")
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role, content: m.content }));
}

function mergeDocuments(current, incoming) {
  const seen = new Set(current.map((d) => d.document));
  const added = incoming.filter((d) => !seen.has(d.document) && seen.add(d.document));
  return [...current, ...added];
}

export function useConversations() {
  const [conversations, setConversations] = useState(loadConversations);
  const [activeId, setActiveId] = useState(() => conversations[0]?.id ?? null);
  // The answer being written right now: { conversationId, stage, documents, text }.
  const [live, setLive] = useState(null);
  const abortRef = useRef(null);

  useEffect(() => {
    writeJSON(CONVERSATIONS_KEY, conversations);
  }, [conversations]);

  const active = conversations.find((c) => c.id === activeId) || null;

  // `touch` moves the conversation to the top of the list; renames and feedback should not.
  function patch(id, change, touch = true) {
    setConversations((list) =>
      list
        .map((c) => (c.id === id ? { ...c, ...change(c), ...(touch ? { updatedAt: Date.now() } : {}) } : c))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    );
  }

  async function ask(conversationId, question, history) {
    const controller = new AbortController();
    abortRef.current = controller;
    const pacer = createPacer((text) => setLive((current) => current && { ...current, text }));
    setLive({ conversationId, stage: "searching", documents: [], text: "" });

    let final = null;
    try {
      await askAssistant(question, history, controller.signal, (name, data) => {
        if (name === "status") setLive((current) => current && { ...current, stage: data.stage });
        if (name === "retrieved") {
          setLive((current) => current && { ...current, documents: mergeDocuments(current.documents, data.documents || []) });
        }
        if (name === "token") pacer.push(data.text ?? "");
        if (name === "done") final = data;
      });
    } catch (error) {
      if (!final) final = { failure: error.name === "AbortError" ? "stopped" : "failed" };
    }
    pacer.stop();

    const partial = pacer.received();
    let reply;
    if (final.failure) {
      reply = { content: partial, sources: [], state: final.failure };
    } else {
      reply = { content: final.answer, sources: final.sources ?? [], state: "done" };
    }

    patch(conversationId, (c) => ({
      messages: [...c.messages, { id: newId(), role: "assistant", createdAt: Date.now(), ...reply }],
    }));
    abortRef.current = null;
    setLive(null);
  }

  function send(text) {
    const question = text.trim();
    if (!question || live) return;

    const userMessage = { id: newId(), role: "user", content: question, createdAt: Date.now() };
    const history = toHistory(active ? active.messages : []);
    let conversationId = activeId;

    if (active) {
      patch(active.id, (c) => ({ messages: [...c.messages, userMessage] }));
    } else {
      const now = Date.now();
      conversationId = newId();
      const created = { id: conversationId, title: makeTitle(question), createdAt: now, updatedAt: now, messages: [userMessage] };
      setConversations((list) => [created, ...list]);
      setActiveId(conversationId);
    }

    ask(conversationId, question, history);
  }

  function regenerate() {
    if (!active || live) return;

    const messages = active.messages;
    const questionIndex = messages.map((m) => m.role).lastIndexOf("user");
    if (questionIndex === -1) return;

    patch(active.id, () => ({ messages: messages.slice(0, questionIndex + 1) }));
    ask(active.id, messages[questionIndex].content, toHistory(messages.slice(0, questionIndex)));
  }

  function editAndResend(messageId, text) {
    const question = text.trim();
    if (!active || live || !question) return;

    const index = active.messages.findIndex((m) => m.id === messageId);
    if (index === -1) return;

    const edited = { ...active.messages[index], content: question, createdAt: Date.now() };
    patch(active.id, () => ({ messages: [...active.messages.slice(0, index), edited] }));
    ask(active.id, question, toHistory(active.messages.slice(0, index)));
  }

  function stop() {
    abortRef.current?.abort();
  }

  function rename(id, title) {
    const clean = title.trim();
    if (clean) patch(id, () => ({ title: clean }), false);
  }

  function setFeedback(messageId, value) {
    if (!active) return;
    patch(
      active.id,
      (c) => ({
        messages: c.messages.map((m) => (m.id === messageId ? { ...m, feedback: m.feedback === value ? null : value } : m)),
      }),
      false,
    );
  }

  function remove(id) {
    if (live?.conversationId === id) stop();
    setConversations((list) => list.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  }

  function clearAll() {
    stop();
    setConversations([]);
    setActiveId(null);
  }

  return {
    conversations,
    active,
    activeId,
    live: live && live.conversationId === activeId ? live : null,
    busy: live !== null,
    startNew: () => setActiveId(null),
    select: setActiveId,
    send,
    regenerate,
    editAndResend,
    stop,
    rename,
    remove,
    clearAll,
    setFeedback,
  };
}
