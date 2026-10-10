import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../adminApi";
import { TOPIC_ICONS } from "../../topics";
import { Card, ConfirmButton, Field, PageHead, useAdminData, useNotice } from "../ui";

const ICON_NAMES = Object.keys(TOPIC_ICONS);

function PasswordCard({ say }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");

  async function change(event) {
    event.preventDefault();
    try {
      await api("/me/password", { method: "POST", body: { current_password: current, new_password: next } });
      setCurrent("");
      setNext("");
      say("Your password was changed.");
    } catch (error) {
      say(error.message, "error");
    }
  }

  return (
    <Card title="Your password">
      <form className="ad-grid" onSubmit={change}>
        <Field label="Current password">
          <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="New password" hint="At least 10 characters">
          <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <div>
          <button className="ad-btn" disabled={!current || next.length < 10}>
            Change password
          </button>
        </div>
      </form>
    </Card>
  );
}

function ClearDataCard({ say }) {
  async function clear() {
    try {
      const result = await api("/analytics/data", { method: "DELETE" });
      say(`Deleted ${result.questions} saved question(s) and ${result.ratings} rating(s).`);
    } catch (error) {
      say(error.message, "error");
    }
  }

  return (
    <Card
      title="Delete saved questions and ratings"
      hint="Starts the statistics, the gaps list and the poor-answer list again from zero. This cannot be undone. Documents and settings are not touched."
    >
      <ConfirmButton onConfirm={clear} label="Yes, delete" className="ad-btn ad-btn-danger-outline">
        Delete saved questions and ratings
      </ConfirmButton>
    </Card>
  );
}

export default function Settings({ admin }) {
  const { data, reload } = useAdminData("/settings");
  const [form, setForm] = useState(null);
  const [notice, say] = useNotice();

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <p className="ad-empty">Loading…</p>;

  const set = (key, value) => setForm({ ...form, [key]: value });
  const text = (key) => ({ value: form[key] ?? "", onChange: (e) => set(key, e.target.value) });
  const number = (key) => ({ value: form[key], onChange: (e) => set(key, Number(e.target.value)) });

  function updateTopic(index, patch) {
    set("suggested_topics", form.suggested_topics.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }

  async function save() {
    try {
      const body = {
        ...form,
        suggested_topics: form.suggested_topics
          .map((t) => ({ ...t, questions: t.questions.map((q) => q.trim()).filter(Boolean) }))
          .filter((t) => t.title.trim()),
      };
      await api("/settings", { method: "PUT", body });
      say("Settings saved.");
      reload();
    } catch (error) {
      say(error.message, "error");
    }
  }

  return (
    <>
      <PageHead title="Settings">
        <button className="ad-btn ad-btn-primary" onClick={save}>
          Save changes
        </button>
      </PageHead>
      {notice}

      <Card title="What students see" hint="This is the text on the home screen, in the About window and under the message box.">
        <div className="ad-stack">
          <Field label="Name of the assistant">
            <input {...text("app_name")} maxLength={80} />
          </Field>
          <Field label="Short description">
            <textarea rows={2} {...text("tagline")} maxLength={300} />
          </Field>
          <Field label="Notice about answers" hint="Shown under the message box and in About. Keep it short.">
            <textarea rows={3} {...text("notice")} maxLength={1000} />
          </Field>
          <div className="ad-grid">
            <Field label="Contact email">
              <input type="email" {...text("contact_email")} />
            </Field>
            <Field label="Website">
              <input type="url" {...text("contact_website")} />
            </Field>
          </div>
          <Field label="Announcement banner" hint="Shown at the top of the chat for everyone. Leave empty for none, for example “Registration closes on 30 November.”">
            <input {...text("announcement")} maxLength={500} />
          </Field>
        </div>
      </Card>

      <Card title="Suggested questions" hint="Groups of example questions on the home screen. One question per line.">
        {form.suggested_topics.map((topic, index) => (
          <div key={index} className="ad-topic">
            <div className="ad-grid">
              <Field label="Group title">
                <input value={topic.title} onChange={(e) => updateTopic(index, { title: e.target.value })} maxLength={80} />
              </Field>
              <Field label="Icon">
                <select value={topic.icon} onChange={(e) => updateTopic(index, { icon: e.target.value })}>
                  {ICON_NAMES.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Questions">
              <textarea rows={3} value={topic.questions.join("\n")} onChange={(e) => updateTopic(index, { questions: e.target.value.split("\n") })} />
            </Field>
            <button className="ad-btn ad-btn-danger-outline" onClick={() => set("suggested_topics", form.suggested_topics.filter((_, i) => i !== index))}>
              <Trash2 size={15} aria-hidden="true" />
              Remove group
            </button>
          </div>
        ))}
        <button className="ad-btn" onClick={() => set("suggested_topics", [...form.suggested_topics, { title: "New group", icon: "file-text", questions: [] }])}>
          <Plus size={16} aria-hidden="true" />
          Add group
        </button>
      </Card>

      <Card title="Usage limits" hint="Protects the shared model quota from one person asking too many questions.">
        <div className="ad-grid">
          <Field label="Questions allowed per person" hint="0 turns the limit off">
            <input type="number" min="0" max="1000" {...number("rate_limit_count")} />
          </Field>
          <Field label="In how many minutes">
            <input type="number" min="1" max="1440" {...number("rate_limit_minutes")} />
          </Field>
        </div>
      </Card>

      <Card title="How answers are found" hint="Change these only if answers are missing relevant details or are wrong.">
        <div className="ad-grid ad-grid-3">
          <Field label="Passages read per question" hint="Default 6">
            <input type="number" min="1" max="15" {...number("top_k")} />
          </Field>
          <Field label="Relevance needed (0 to 1)" hint="Higher means more “I couldn’t find this”. Default 0.35">
            <input type="number" min="0" max="1" step="0.05" {...number("min_relevance")} />
          </Field>
          <Field label="Answer length limit" hint="Default 1200">
            <input type="number" min="200" max="4000" step="100" {...number("max_tokens")} />
          </Field>
        </div>
      </Card>

      <Card title="Privacy" hint="Questions are stored without any name or address, to show you what students need. Switch this off to stop saving them; ratings and the gap list will then stop working.">
        <label className="ad-check">
          <input type="checkbox" checked={form.log_questions} onChange={(e) => set("log_questions", e.target.checked)} />
          Save students’ questions
        </label>
        <Field label="Delete saved questions after (days)" hint="0 keeps them until you delete them">
          <input type="number" min="0" max="3650" {...number("log_retention_days")} />
        </Field>
      </Card>

      {admin.role === "super_admin" && <ClearDataCard say={say} />}

      <PasswordCard say={say} />
    </>
  );
}
