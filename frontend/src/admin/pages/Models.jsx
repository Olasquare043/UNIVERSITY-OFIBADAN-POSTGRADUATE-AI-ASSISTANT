import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../adminApi";
import { Card, Chip, Field, PageHead, useAdminData, useNotice } from "../ui";

const PRESETS = [
  { id: "ollama", name: "Ollama (a computer you run)", base_url: "http://localhost:11434/v1", api_key_env: "" },
  { id: "openrouter", name: "OpenRouter", base_url: "https://openrouter.ai/api/v1", api_key_env: "OPENROUTER_API_KEY" },
];

export default function Models() {
  const { data, reload } = useAdminData("/models");
  const [draft, setDraft] = useState(null);
  const [tests, setTests] = useState({});
  const [newModel, setNewModel] = useState({ provider: "", id: "", label: "" });
  const [notice, say] = useNotice();

  useEffect(() => {
    if (!data) return;
    const { providers, models, default_model, fallback_model, student_model_choice } = data;
    setDraft({ providers, models, default_model, fallback_model, student_model_choice });
    setNewModel((m) => ({ ...m, provider: m.provider || providers[0]?.id || "" }));
  }, [data]);

  if (!draft) return <p className="ad-empty">Loading…</p>;

  const change = (patch) => setDraft({ ...draft, ...patch });
  const enabledModels = draft.models.filter((m) => m.enabled);
  const available = data.available[newModel.provider] ?? { models: [], error: "" };

  function updateModel(id, patch) {
    change({ models: draft.models.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }

  function updateProvider(id, patch) {
    change({ providers: draft.providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  }

  function addModel() {
    const id = newModel.id.trim();
    if (!id || draft.models.some((m) => m.id === id)) return say("Enter a model id that is not already in the list.", "error");
    change({ models: [...draft.models, { id, provider: newModel.provider, label: newModel.label.trim() || id, enabled: true }] });
    setNewModel({ ...newModel, id: "", label: "" });
  }

  function removeModel(id) {
    if (id === draft.default_model || id === draft.fallback_model) return say("Choose a different default or fallback model first.", "error");
    change({ models: draft.models.filter((m) => m.id !== id) });
  }

  function addProvider(preset) {
    const base = preset ?? { id: "", name: "", base_url: "", api_key_env: "" };
    let id = base.id || `provider-${draft.providers.length + 1}`;
    while (draft.providers.some((p) => p.id === id)) id += "-2";
    change({ providers: [...draft.providers, { ...base, id, tokens_per_minute: null }] });
  }

  function removeProvider(id) {
    if (draft.models.some((m) => m.provider === id)) return say("Remove this provider's models first.", "error");
    change({ providers: draft.providers.filter((p) => p.id !== id) });
  }

  async function save() {
    try {
      await api("/models", { method: "PUT", body: draft });
      say("Model settings saved. They apply to the next question.");
      reload();
    } catch (error) {
      say(error.message, "error");
    }
  }

  async function test(id) {
    setTests((t) => ({ ...t, [id]: { busy: true } }));
    try {
      const result = await api("/models/test", { method: "POST", body: { model: id } });
      setTests((t) => ({ ...t, [id]: result }));
    } catch (error) {
      setTests((t) => ({ ...t, [id]: { ok: false, error: error.message } }));
    }
  }

  return (
    <>
      <PageHead title="Models">
        <button className="ad-btn ad-btn-primary" onClick={save}>
          Save changes
        </button>
      </PageHead>
      {notice}
      <p className="ad-hint ad-intro">
        Save after changing anything below. Test a model first: a model that fails its test will make students wait or see an error.
      </p>

      <Card title="Which model answers" hint="The fallback takes over when the default is busy, over its limit, or switched off.">
        <div className="ad-grid">
          <Field label="Default model">
            <select value={draft.default_model} onChange={(e) => change({ default_model: e.target.value })}>
              {enabledModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fallback model">
            <select value={draft.fallback_model} onChange={(e) => change({ fallback_model: e.target.value })}>
              {enabledModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} ({m.id})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="ad-check">
          <input type="checkbox" checked={draft.student_model_choice} onChange={(e) => change({ student_model_choice: e.target.checked })} />
          Let students choose between the enabled models
        </label>
      </Card>

      <Card title="Available models" hint="Turn a model off to stop using it. The label is what students see if they can choose.">
        <ul className="ad-list">
          {draft.models.map((m) => {
            const result = tests[m.id];
            return (
              <li key={m.id} className="ad-model">
                <div className="ad-model-main">
                  <input value={m.label} onChange={(e) => updateModel(m.id, { label: e.target.value })} aria-label={`Label for ${m.id}`} />
                  <p className="ad-hint">
                    {m.id} · {draft.providers.find((p) => p.id === m.provider)?.name ?? m.provider}
                  </p>
                  {result && !result.busy && (
                    <p className={result.ok ? "ad-ok-text" : "ad-error-text"}>
                      {result.ok ? `Working: replied in ${(result.latency_ms / 1000).toFixed(1)} s` : result.error}
                    </p>
                  )}
                </div>
                <label className="ad-check">
                  <input type="checkbox" checked={m.enabled} disabled={m.id === draft.default_model || m.id === draft.fallback_model} onChange={(e) => updateModel(m.id, { enabled: e.target.checked })} />
                  On
                </label>
                <button className="ad-btn" onClick={() => test(m.id)} disabled={result?.busy}>
                  {result?.busy ? "Testing…" : "Test"}
                </button>
                <button className="ad-icon-btn" onClick={() => removeModel(m.id)} aria-label={`Remove ${m.id}`}>
                  <Trash2 size={16} />
                </button>
              </li>
            );
          })}
        </ul>

        <h3 className="ad-sub">Add a model</h3>
        <div className="ad-grid ad-grid-3">
          <Field label="Provider">
            <select value={newModel.provider} onChange={(e) => setNewModel({ ...newModel, provider: e.target.value })}>
              {draft.providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Model id" hint={available.error || (available.models.length ? "Pick from the list or type one." : "")}>
            <input list="provider-models" value={newModel.id} onChange={(e) => setNewModel({ ...newModel, id: e.target.value })} placeholder="for example llama3.2:3b" />
            <datalist id="provider-models">
              {available.models.map((id) => (
                <option key={id} value={id} />
              ))}
            </datalist>
          </Field>
          <Field label="Label">
            <input value={newModel.label} onChange={(e) => setNewModel({ ...newModel, label: e.target.value })} placeholder="for example Offline" />
          </Field>
        </div>
        <button className="ad-btn" onClick={addModel}>
          <Plus size={16} aria-hidden="true" />
          Add model
        </button>
      </Card>

      <Card
        title="Providers"
        hint="A provider is any service that speaks the OpenAI format. Keys are never stored here: enter the name of the server setting that holds the key."
      >
        <ul className="ad-list">
          {draft.providers.map((p) => (
            <li key={p.id} className="ad-provider">
              <div className="ad-grid ad-grid-3">
                <Field label="Name">
                  <input value={p.name} onChange={(e) => updateProvider(p.id, { name: e.target.value })} />
                </Field>
                <Field label="Address">
                  <input value={p.base_url} onChange={(e) => updateProvider(p.id, { base_url: e.target.value })} />
                </Field>
                <Field label="Key setting name" hint="Leave empty for a local model">
                  <input value={p.api_key_env} onChange={(e) => updateProvider(p.id, { api_key_env: e.target.value })} placeholder="none needed" />
                </Field>
              </div>
              <div className="ad-row">
                <Field label="Token limit per minute" hint="Leave empty if there is no limit (a local model has none)">
                  <input type="number" min="0" value={p.tokens_per_minute ?? ""} onChange={(e) => updateProvider(p.id, { tokens_per_minute: e.target.value ? Number(e.target.value) : null })} />
                </Field>
                <Chip tone="neutral">{Object.keys(data.available).includes(p.id) && data.available[p.id].models.length ? "Reachable" : "Not checked"}</Chip>
                <button className="ad-btn ad-btn-danger-outline" onClick={() => removeProvider(p.id)}>
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="ad-row">
          <button className="ad-btn" onClick={() => addProvider()}>
            <Plus size={16} aria-hidden="true" />
            Add provider
          </button>
          {PRESETS.filter((preset) => !draft.providers.some((p) => p.id === preset.id)).map((preset) => (
            <button key={preset.id} className="ad-btn" onClick={() => addProvider(preset)}>
              Add {preset.name}
            </button>
          ))}
        </div>
        <p className="ad-hint">
          A model that runs on a university computer (with Ollama) has no usage limit and no cost, but that computer must stay on and be reachable from this server.
        </p>
      </Card>
    </>
  );
}
