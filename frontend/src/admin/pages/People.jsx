import { useState } from "react";
import { api } from "../adminApi";
import { Card, Chip, Field, formatDateTime, PageHead, useAdminData, useNotice } from "../ui";

function NewAdmin({ onCreated, say }) {
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "editor" });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  async function create(event) {
    event.preventDefault();
    try {
      await api("/users", { method: "POST", body: form });
      setForm({ email: "", name: "", password: "", role: "editor" });
      say("Admin created. Share the password with them privately.");
      onCreated();
    } catch (error) {
      say(error.message, "error");
    }
  }

  return (
    <Card title="Add an admin" hint="Editors manage documents, settings and insights. Super admins can also manage admins and models.">
      <form className="admin-stack" onSubmit={create}>
        <div className="admin-grid">
          <Field label="Email">
            <input type="email" value={form.email} onChange={set("email")} required />
          </Field>
          <Field label="Name">
            <input value={form.name} onChange={set("name")} />
          </Field>
          <Field label="Temporary password" hint="At least 10 characters">
            <input type="password" autoComplete="new-password" value={form.password} onChange={set("password")} required minLength={10} />
          </Field>
          <Field label="Role">
            <select value={form.role} onChange={set("role")}>
              <option value="editor">Editor</option>
              <option value="super_admin">Super admin</option>
            </select>
          </Field>
        </div>
        <div>
          <button className="admin-btn admin-btn-primary">Create admin</button>
        </div>
      </form>
    </Card>
  );
}

export default function People() {
  const users = useAdminData("/users");
  const audit = useAdminData("/audit");
  const [notice, say] = useNotice();

  async function update(id, body, done) {
    try {
      await api(`/users/${id}`, { method: "PATCH", body });
      say(done);
      users.reload();
      audit.reload();
    } catch (error) {
      say(error.message, "error");
    }
  }

  function resetPassword(user) {
    const password = window.prompt(`New password for ${user.email} (at least 10 characters):`);
    if (password) update(user.id, { password }, "Password changed.");
  }

  return (
    <>
      <PageHead title="Admins" />
      {notice}

      <Card className="admin-flush">
        <ul className="admin-docs">
          {users.data?.users.map((user) => (
            <li key={user.id} data-hidden={!user.active}>
              <div className="admin-doc-main">
                <p className="admin-doc-name">{user.name || user.email}</p>
                <p className="admin-hint">
                  {user.email} · {user.last_login ? `last sign-in ${formatDateTime(user.last_login)}` : "never signed in"}
                </p>
              </div>
              <div className="admin-doc-side">
                <Chip tone={user.role === "super_admin" ? "info" : "neutral"}>{user.role === "super_admin" ? "Super admin" : "Editor"}</Chip>
                {!user.active && <Chip tone="warn">Deactivated</Chip>}
              </div>
              <div className="admin-doc-actions admin-wrap">
                <button className="admin-btn" onClick={() => update(user.id, { role: user.role === "super_admin" ? "editor" : "super_admin" }, "Role changed.")}>
                  Make {user.role === "super_admin" ? "editor" : "super admin"}
                </button>
                <button className="admin-btn" onClick={() => resetPassword(user)}>
                  Reset password
                </button>
                <button className="admin-btn" onClick={() => update(user.id, { active: !user.active }, user.active ? "Admin deactivated." : "Admin activated.")}>
                  {user.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <NewAdmin onCreated={() => { users.reload(); audit.reload(); }} say={say} />

      <Card title="Recent changes" hint="Who changed what.">
        {audit.data?.entries.length === 0 && <p className="admin-empty">Nothing yet.</p>}
        <ul className="admin-audit">
          {audit.data?.entries.map((entry, i) => (
            <li key={i}>
              <span className="admin-hint">{formatDateTime(entry.time)}</span>
              <span>
                <strong>{entry.admin}</strong> {entry.action}
                {entry.target && `: ${entry.target}`}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
