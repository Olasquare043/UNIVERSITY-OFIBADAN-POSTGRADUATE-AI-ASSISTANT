import { useEffect, useRef, useState } from "react";
import { Mic, SendHorizontal, Square } from "lucide-react";

const MAX_HEIGHT = 200;
const MAX_LENGTH = 2000;

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;

export default function Composer({ pending, focusKey, inputRef, onSend, onStop }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const input = inputRef.current;
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, MAX_HEIGHT) + "px";
  }, [text, inputRef]);

  // Skip auto-focus on small screens so the keyboard does not cover the chat.
  useEffect(() => {
    if (window.innerWidth >= 860) inputRef.current?.focus();
  }, [focusKey, inputRef]);

  useEffect(() => () => recognitionRef.current?.abort(), []);

  const canSend = text.trim().length > 0 && !pending;

  function submit() {
    if (!canSend) return;
    recognitionRef.current?.stop();
    onSend(text.trim());
    setText("");
  }

  function onKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new Recognition();
    const spokenBefore = text.trim() ? text.trimEnd() + " " : "";
    recognition.lang = "en-NG";
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results, (result) => result[0].transcript).join("");
      setText((spokenBefore + transcript).slice(0, MAX_LENGTH));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  return (
    <div className="composer-wrap">
      <form
        className="composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          name="question"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={listening ? "Listening…" : "Ask a postgraduate question…"}
          aria-label="Your question"
          rows={1}
          maxLength={MAX_LENGTH}
        />
        {Recognition && (
          <button
            type="button"
            className="mic-btn"
            data-on={listening}
            onClick={toggleListening}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            aria-pressed={listening}
            title="Voice input"
          >
            <Mic size={19} />
          </button>
        )}
        {pending ? (
          <button type="button" className="send-btn stop" onClick={onStop} aria-label="Stop generating">
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button type="submit" className="send-btn" disabled={!canSend} aria-label="Send message">
            <SendHorizontal size={18} />
          </button>
        )}
      </form>
      <p className="disclaimer">
        Answers come from official University of Ibadan documents. Always verify important details with the Postgraduate
        College.
      </p>
    </div>
  );
}
