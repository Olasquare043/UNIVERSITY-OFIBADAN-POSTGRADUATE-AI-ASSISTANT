import { useState } from "react";
import Crest from "../../components/Crest";
import { api } from "../adminApi";
import "../admin.css";

export default function Login({ onSignedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onSignedIn(await api("/login", { method: "POST", body: { email, password } }));
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
    }
  }

  return (
    <main className="ad-login">
      <form className="ad-login-card" onSubmit={submit}>
        <Crest height={64} alt="University of Ibadan crest" />
        <h1>Admin sign in</h1>
        <p className="ad-hint">For staff who manage the Postgraduate Assistant.</p>

        <label className="ad-field">
          <span className="ad-label">Email</span>
          <input type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="ad-field">
          <span className="ad-label">Password</span>
          <input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>

        {error && (
          <p className="ad-error" role="alert">
            {error}
          </p>
        )}
        <button className="ad-btn ad-btn-primary ad-btn-wide" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <a className="ad-back" href="/">
          Back to the assistant
        </a>
      </form>
    </main>
  );
}
