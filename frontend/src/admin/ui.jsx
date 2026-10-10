import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { api } from "./adminApi";

export function PageHead({ title, children }) {
  return (
    <div className="ad-pagehead">
      <h1>{title}</h1>
      <div className="ad-pagehead-actions">{children}</div>
    </div>
  );
}

export function Card({ title, hint, children, className = "" }) {
  return (
    <section className={`ad-card ${className}`}>
      {title && <h2>{title}</h2>}
      {hint && <p className="ad-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="ad-field">
      <span className="ad-label">{label}</span>
      {children}
      {hint && <span className="ad-hint">{hint}</span>}
    </label>
  );
}

export function Chip({ tone = "neutral", children }) {
  return (
    <span className="ad-chip" data-tone={tone}>
      {children}
    </span>
  );
}

// Shows a short confirmation or error after an action. Use: const [notice, say] = useNotice();
export function useNotice() {
  const [message, setMessage] = useState(null);
  const timer = useRef(null);

  const say = useCallback((text, tone = "ok") => {
    clearTimeout(timer.current);
    setMessage({ text, tone });
    timer.current = setTimeout(() => setMessage(null), tone === "ok" ? 3500 : 8000);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const node = message && (
    <div className="ad-notice" data-tone={message.tone} role={message.tone === "ok" ? "status" : "alert"}>
      {message.tone === "ok" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
      {message.text}
    </div>
  );
  return [node, say];
}

// Loads data from the admin API and lets the page refresh it.
export function useAdminData(path, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });

  const load = useCallback(() => {
    return api(path)
      .then((data) => setState({ loading: false, data, error: "" }))
      .catch((error) => setState((s) => ({ ...s, loading: false, error: error.message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}

// Two-step delete: the first click asks, the second confirms.
export function ConfirmButton({ children, onConfirm, label = "Delete", className = "ad-btn" }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button className={className} onClick={() => setAsking(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="ad-confirm">
      <button
        className="ad-btn ad-btn-danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {label}?
      </button>
      <button className="ad-btn" onClick={() => setAsking(false)}>
        Cancel
      </button>
    </span>
  );
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
