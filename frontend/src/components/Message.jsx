import { useEffect, useState } from "react";
import { AlertCircle, Check, Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp, Volume2, VolumeX } from "lucide-react";
import Markdown from "./Markdown";
import Sources from "./Sources";
import Crest from "./Crest";
import { formatFull, formatRelative, toSpeakable } from "../format";

const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

const NOTICES = {
  stopped: "You stopped this answer before it finished.",
  failed: "The answer was interrupted before it finished.",
};

const EMPTY_TEXT = {
  stopped: "Stopped before an answer arrived.",
  failed: "Something went wrong while getting your answer. Check your connection and try again.",
};

export function AssistantAvatar({ tone }) {
  return (
    <div className="avatar" data-tone={tone} aria-hidden="true">
      {tone === "error" ? <AlertCircle size={18} /> : <Crest height={24} />}
    </div>
  );
}

function Timestamp({ time }) {
  if (!time) return null;
  return (
    <time className="msg-time" dateTime={new Date(time).toISOString()} title={formatFull(time)}>
      {formatRelative(time)}
    </time>
  );
}

function ReadAloud({ text }) {
  const [speaking, setSpeaking] = useState(false);

  // Stop reading if this message leaves the screen.
  useEffect(() => () => speaking && window.speechSynthesis.cancel(), [speaking]);

  if (!speechSupported) return null;

  function toggle() {
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(toSpeakable(text));
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      className="action-btn"
      data-on={speaking}
      onClick={toggle}
      aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
      aria-pressed={speaking}
      title={speaking ? "Stop reading" : "Read aloud"}
    >
      {speaking ? <VolumeX size={16} /> : <Volume2 size={16} />}
    </button>
  );
}

function Actions({ message, isLast, onRegenerate, onFeedback }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked on insecure origins; nothing else to do.
    }
  }

  return (
    <div className="actions">
      <button className="action-btn" onClick={copy} aria-label={copied ? "Copied" : "Copy answer"} title="Copy">
        {copied ? <Check size={16} /> : <Copy size={16} />}
      </button>
      {isLast && (
        <button className="action-btn" onClick={onRegenerate} aria-label="Regenerate answer" title="Regenerate">
          <RefreshCw size={16} />
        </button>
      )}
      <ReadAloud text={message.content} />
      <button
        className="action-btn"
        data-on={message.feedback === "up"}
        onClick={() => onFeedback("up")}
        aria-label="Good answer"
        aria-pressed={message.feedback === "up"}
        title="Good answer"
      >
        <ThumbsUp size={16} />
      </button>
      <button
        className="action-btn"
        data-on={message.feedback === "down"}
        onClick={() => onFeedback("down")}
        aria-label="Poor answer"
        aria-pressed={message.feedback === "down"}
        title="Poor answer"
      >
        <ThumbsDown size={16} />
      </button>
    </div>
  );
}

function UserMessage({ message, canEdit, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  function save() {
    if (!draft.trim()) return;
    setEditing(false);
    onEdit(draft);
  }

  if (editing) {
    return (
      <div className="msg msg-user">
        <div className="edit-box">
          <textarea
            name="edit-message"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-label="Edit your message"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <div className="edit-actions">
            <button className="btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={save} disabled={!draft.trim()}>
              Save and resend
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="msg msg-user">
      <div className="user-line">
        {canEdit && (
          <button
            className="action-btn edit-btn"
            onClick={() => {
              setDraft(message.content);
              setEditing(true);
            }}
            aria-label="Edit and resend"
            title="Edit and resend"
          >
            <Pencil size={15} />
          </button>
        )}
        <div className="bubble">{message.content}</div>
      </div>
      <Timestamp time={message.createdAt} />
    </div>
  );
}

export default function Message({ message, isLast, canEdit, onRegenerate, onFeedback, onEdit, onOpenSource }) {
  if (message.role === "user") {
    return <UserMessage message={message} canEdit={canEdit} onEdit={onEdit} />;
  }

  const finished = message.state === "done";

  if (!message.content) {
    return (
      <div className="msg msg-assistant">
        <AssistantAvatar tone="error" />
        <div className="msg-body">
          <p className="error-text" role="alert">
            {EMPTY_TEXT[message.state] || EMPTY_TEXT.failed}
          </p>
          {isLast && (
            <button className="retry-btn" onClick={onRegenerate}>
              <RefreshCw size={15} />
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <article className="msg msg-assistant">
      <AssistantAvatar />
      <div className="msg-body">
        <Markdown text={message.content} />
        {!finished && (
          <p className="notice" role="status">
            {NOTICES[message.state]}
          </p>
        )}
        {message.sources?.length > 0 && <Sources sources={message.sources} onOpen={onOpenSource} />}
        <Actions message={message} isLast={isLast} onRegenerate={onRegenerate} onFeedback={onFeedback} />
        <Timestamp time={message.createdAt} />
      </div>
    </article>
  );
}
