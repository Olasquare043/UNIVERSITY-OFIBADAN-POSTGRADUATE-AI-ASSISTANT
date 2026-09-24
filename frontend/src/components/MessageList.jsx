import { useEffect, useRef, useState } from "react";
import { ArrowDown, FileText, Sparkles } from "lucide-react";
import Message, { AssistantAvatar } from "./Message";
import Markdown from "./Markdown";
import Crest from "./Crest";
import { suggestFollowUps } from "../topics";

const NEAR_BOTTOM_PX = 80;

// Shown when a question has no answer, for example after the page was closed mid-answer.
const UNANSWERED = { id: "unanswered", role: "assistant", state: "failed", content: "" };

const STAGE_LABEL = {
  searching: "Searching the official documents…",
  writing: "Writing your answer…",
};

function LiveMessage({ live }) {
  if (live.text) {
    return (
      <article className="msg msg-assistant" aria-busy="true">
        <AssistantAvatar />
        <div className="msg-body">
          <Markdown text={live.text} streaming />
        </div>
      </article>
    );
  }

  return (
    <div className="msg msg-assistant" role="status" aria-live="polite">
      <AssistantAvatar />
      <div className="msg-body">
        <p className="thinking-label">
          {STAGE_LABEL[live.stage] || STAGE_LABEL.searching}
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>

        {live.documents.length > 0 && (
          <ul className="reading" aria-label="Documents being read">
            {live.documents.map((doc) => (
              <li key={doc.document} className="reading-chip">
                <FileText size={14} aria-hidden="true" />
                {doc.document}
              </li>
            ))}
          </ul>
        )}

        {live.documents.length === 0 && (
          <div className="skeleton" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>
    </div>
  );
}

function FollowUps({ questions, onPick }) {
  if (questions.length === 0) return null;

  return (
    <div className="follow-ups">
      <p className="follow-label">
        <Sparkles size={14} aria-hidden="true" />
        Ask next
      </p>
      <ul>
        {questions.map((question) => (
          <li key={question}>
            <button className="follow-chip" onClick={() => onPick(question)}>
              {question}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MessageList({ title, messages, live, busy, onSend, onRegenerate, onFeedback, onEdit, onOpenSource }) {
  const scrollRef = useRef(null);
  const stickToBottom = useRef(true);
  const firstRender = useRef(true);
  const [showJump, setShowJump] = useState(false);

  function scrollToBottom(smooth) {
    const el = scrollRef.current;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
  }

  function onScroll() {
    const el = scrollRef.current;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    stickToBottom.current = nearBottom;
    setShowJump(!nearBottom);
  }

  useEffect(() => {
    // A message the user just sent should always be in view.
    if (messages[messages.length - 1]?.role === "user") stickToBottom.current = true;
    if (stickToBottom.current) scrollToBottom(!firstRender.current && !live?.text);
    firstRender.current = false;
  }, [messages, live]);

  const last = messages[messages.length - 1];
  const lastUserIndex = messages.map((m) => m.role).lastIndexOf("user");
  const followUps =
    !busy && last?.role === "assistant" && last.state === "done"
      ? suggestFollowUps(
          messages[lastUserIndex]?.content ?? "",
          messages.filter((m) => m.role === "user").map((m) => m.content),
        )
      : [];

  return (
    <div className="thread-wrap">
      <div className="thread" ref={scrollRef} onScroll={onScroll}>
        <div className="thread-inner">
          <div className="print-title">
            <Crest height={48} />
            <div>
              <h1>{title}</h1>
              <p>University of Ibadan Postgraduate Assistant</p>
            </div>
          </div>

          {messages.map((message, index) => (
            <Message
              key={message.id}
              message={message}
              isLast={index === messages.length - 1 && !busy}
              canEdit={index === lastUserIndex && !busy}
              onRegenerate={onRegenerate}
              onFeedback={(value) => onFeedback(message.id, value)}
              onEdit={(text) => onEdit(message.id, text)}
              onOpenSource={onOpenSource}
            />
          ))}
          {live && <LiveMessage live={live} />}
          {!busy && last?.role === "user" && <Message message={UNANSWERED} isLast onRegenerate={onRegenerate} />}
          <FollowUps questions={followUps} onPick={onSend} />
        </div>
      </div>

      {showJump && (
        <button className="jump-btn" onClick={() => scrollToBottom(true)} aria-label="Jump to latest message">
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  );
}
