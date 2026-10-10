import json
import time

import pytest

from app.rag import pipeline

DOC = b"# Library Rules\n\nThe library fine for an overdue book is 50 naira per day. Borrowers may keep a book for 14 days.\n"


@pytest.fixture
def fake_model(monkeypatch):
    """Replace the language model so tests never call a real service."""
    calls = []

    def fake_stream(messages, model=None, on_model=None, **_):
        calls.append(model)
        if on_model:
            on_model(model or "test-model")
        yield "The fine is 50 naira per day (Source: Library Rules)."

    monkeypatch.setattr(pipeline, "stream_answer", fake_stream)
    return calls


def upload_and_wait(client, name="Library_Rules.md", data=DOC):
    response = client.post("/api/admin/documents", files=[("files", (name, data, "text/markdown"))])
    assert response.status_code == 200, response.text
    document = response.json()["documents"][0]
    for _ in range(60):
        document = next(d for d in client.get("/api/admin/documents").json()["documents"] if d["id"] == document["id"])
        if document["status"] != "processing":
            return document
        time.sleep(0.5)
    raise AssertionError("document never finished processing")


def ask(client, question, **extra):
    return client.post("/api/chat/stream", json={"message": question, **extra})


def done_event(response):
    block = [b for b in response.text.split("\n\n") if b.startswith("event: done")][0]
    return json.loads(block.split("data: ", 1)[1])


def test_admin_area_needs_login(client):
    assert client.get("/api/admin/documents").status_code == 401
    wrong = client.post("/api/admin/login", json={"email": "boss@example.com", "password": "nope"})
    assert wrong.status_code == 401


def test_editor_cannot_manage_admins(admin):
    created = admin.post(
        "/api/admin/users",
        json={"email": "editor@example.com", "password": "another-long-password", "role": "editor"},
    )
    assert created.status_code == 200
    admin.post("/api/admin/logout")
    login = admin.post("/api/admin/login", json={"email": "editor@example.com", "password": "another-long-password"})
    assert login.status_code == 200
    assert admin.get("/api/admin/users").status_code == 403
    assert admin.get("/api/admin/documents").status_code == 200


def test_last_super_admin_is_protected(admin):
    me = admin.get("/api/admin/me").json()
    response = admin.patch(f"/api/admin/users/{me['id']}", json={"active": False})
    assert response.status_code == 400


def test_upload_search_answer_and_hide(admin, fake_model):
    document = upload_and_wait(admin)
    assert document["status"] == "ready" and document["chunks"] >= 1
    assert document["name"] == "Library Rules"

    admin.put("/api/admin/settings", json={"min_relevance": 0.1})
    found = admin.post("/api/admin/search", json={"query": "how much is the library fine"}).json()["results"]
    assert found and found[0]["source"] == "Library Rules"

    answer = done_event(ask(admin, "How much is the library fine?"))
    assert [s["document"] for s in answer["sources"]] == ["Library Rules"]
    assert answer["log_id"]

    admin.patch(f"/api/admin/documents/{document['id']}", json={"active": False})
    hidden = admin.post("/api/admin/search", json={"query": "library fine"}).json()["results"]
    assert not any(r["source"] == "Library Rules" for r in hidden)
    admin.delete(f"/api/admin/documents/{document['id']}")


def test_unsupported_and_duplicate_uploads_are_rejected(admin):
    bad = admin.post("/api/admin/documents", files=[("files", ("virus.exe", b"x", "application/octet-stream"))]).json()
    assert bad["documents"] == [] and "supported" in bad["errors"][0]

    document = upload_and_wait(admin, "Dup_Doc.md", b"# Dup\n\nSome text about dup documents.\n")
    again = admin.post("/api/admin/documents", files=[("files", ("Dup_Doc.md", b"# Dup\n\nMore.", "text/markdown"))]).json()
    assert "already exists" in again["errors"][0]
    admin.delete(f"/api/admin/documents/{document['id']}")


def test_unanswered_questions_are_listed(admin):
    admin.put("/api/admin/settings", json={"min_relevance": 0.99})
    answer = done_event(ask(admin, "What is the airspeed of a swallow?"))
    assert answer["sources"] == []
    questions = admin.get("/api/admin/analytics/unanswered").json()["questions"]
    assert any(q["question"] == "What is the airspeed of a swallow?" for q in questions)


def test_model_choice_is_limited_to_allowed_models(client, admin, fake_model):
    assert ask(client, "hello", model="openai/gpt-oss-20b").status_code == 400  # choice is switched off

    models = admin.get("/api/admin/models").json()
    admin.put("/api/admin/models", json={**models, "student_model_choice": True})
    assert ask(client, "hello", model="not-a-real-model").status_code == 400
    assert ask(client, "hello", model="openai/gpt-oss-20b").status_code == 200
    assert fake_model[-1] == "openai/gpt-oss-20b"
    assert client.get("/api/config").json()["model_choice"] is True


def test_default_model_must_be_enabled(admin):
    models = admin.get("/api/admin/models").json()
    response = admin.put("/api/admin/models", json={**models, "default_model": "missing"})
    assert response.status_code == 400


def test_rate_limit(client, admin, fake_model):
    admin.put("/api/admin/settings", json={"rate_limit_count": 2})
    assert ask(client, "hello").status_code == 200
    assert ask(client, "hi").status_code == 200
    third = ask(client, "hey")
    assert third.status_code == 429 and "retry-after" in third.headers


def test_settings_round_trip_and_public_config(admin):
    admin.put("/api/admin/settings", json={"app_name": "Test Assistant", "announcement": "Closed on Friday"})
    public = admin.get("/api/config").json()
    assert public["app_name"] == "Test Assistant" and public["announcement"] == "Closed on Friday"
    assert "providers" not in public and "rate_limit_count" not in public
    admin.put("/api/admin/settings", json={"app_name": "UI Postgraduate Assistant", "announcement": ""})


def test_feedback(client, admin, fake_model):
    admin.put("/api/admin/settings", json={"min_relevance": 0.0})
    answer = done_event(ask(client, "hello"))
    sent = client.post("/api/feedback", json={"log_id": answer["log_id"], "value": "down", "comment": "wrong"})
    assert sent.status_code == 200
    assert client.post("/api/feedback", json={"log_id": 99999, "value": "up"}).status_code == 404
    assert any(q["comment"] == "wrong" for q in admin.get("/api/admin/analytics/downvoted").json()["questions"])


def test_only_super_admins_manage_models(admin):
    admin.post(
        "/api/admin/users",
        json={"email": "editor2@example.com", "password": "yet-another-long-pass", "role": "editor"},
    )
    models = admin.get("/api/admin/models").json()
    admin.post("/api/admin/logout")
    admin.post("/api/admin/login", json={"email": "editor2@example.com", "password": "yet-another-long-pass"})
    assert admin.get("/api/admin/models").status_code == 403
    assert admin.put("/api/admin/models", json={k: models[k] for k in ModelKeys}).status_code == 403
    assert admin.post("/api/admin/models/test", json={"model": models["default_model"]}).status_code == 403


ModelKeys = ("providers", "models", "default_model", "fallback_model", "student_model_choice")


def test_providers_cannot_leak_secrets_or_reach_internal_addresses(admin):
    models = admin.get("/api/admin/models").json()
    base = {k: models[k] for k in ModelKeys}

    def save_with(provider):
        return admin.put("/api/admin/models", json={**base, "providers": base["providers"] + [provider]})

    stealing_key = save_with({"id": "evil", "name": "Evil", "base_url": "https://example.com/v1", "api_key_env": "SECRET_KEY"})
    assert stealing_key.status_code == 400 and "key setting" in stealing_key.json()["detail"]

    metadata = save_with({"id": "meta", "name": "Meta", "base_url": "http://169.254.169.254/v1", "api_key_env": ""})
    assert metadata.status_code == 400

    credentials = save_with({"id": "cred", "name": "Cred", "base_url": "https://user:pw@example.com/v1", "api_key_env": ""})
    assert credentials.status_code == 400


def test_citations_are_tidied(client):
    from app.rag.retriever import RetrievedChunk

    chunks = [RetrievedChunk("1", "t", "Hostel Rules", None, 0.9), RetrievedChunk("2", "t", "Handbook", 4, 0.8)]
    text = "Deposit is 15,000 (Source: Hostel Rules, p.1)(2). Fees apply (Source: Handbook, p.4)(1, 2)."
    assert pipeline._tidy_citations(text, chunks) == "Deposit is 15,000 (Source: Hostel Rules). Fees apply (Source: Handbook, p.4)."


def test_provider_connections_are_guarded(monkeypatch):
    import httpx
    import pytest

    from app import config
    from app.services import providers

    assert providers.make_http_client().follow_redirects is False  # an allowed server cannot redirect us inside

    with pytest.raises(ValueError):
        providers.check_host("169.254.169.254", 80, "http")  # cloud metadata address, always refused

    monkeypatch.setattr(config, "ALLOW_LOCAL_MODEL_HOSTS", False)
    with pytest.raises(ValueError):
        providers.check_host("127.0.0.1", 11434, "http")
    with pytest.raises(httpx.ConnectError):  # the transport re-checks at connection time
        providers.make_http_client().get("http://127.0.0.1:11434/v1/models")

    monkeypatch.setattr(config, "ALLOW_LOCAL_MODEL_HOSTS", True)
    providers.check_host("127.0.0.1", 11434, "http")  # allowed when the server owner switches it on
