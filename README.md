# University of Ibadan Postgraduate AI Assistant

A Retrieval-Augmented Generation (RAG) chatbot that answers postgraduate students' questions
from official University of Ibadan documents, cites its sources, and says so when the
documents don't contain the answer.

## How it works

1. **Ingestion** (`app/ingest/`): every file in `data/raw_docs/` is extracted page by page
   (scanned pages are read with OCR), cleaned, split into overlapping chunks, and embedded with
   a local ONNX model (`fastembed`). Chunks and embeddings are saved in `data/processed/` and
   loaded into a in-memory vector index.
2. **Retrieval** (`app/rag/retriever.py`): a question is searched two ways, by meaning
   (embeddings) and by exact words (BM25), and the two rankings are merged (reciprocal rank
   fusion). Follow-up questions are first rewritten into standalone questions.
3. **Generation** (`app/rag/`): the top chunks go to a Groq-hosted LLM with strict rules: answer
   only from the context, cite `(Source: document, p.N)`, and admit when the answer isn't there.
   Answers stream to the browser token by token.
4. **Interface** (`frontend/`): a React chat app (streaming, sources with passages,
   conversation history, official-documents panel), installable on a phone or desktop. The API
   serves the built app.
5. **Admin console** (`/admin`): staff manage the documents, models, settings and usage without
   touching code. See "Admin console" below.

## Project layout

```
app/
  config.py            settings read from .env
  db.py, models.py     database (SQLite locally, Postgres when deployed) and its tables
  vectorstore.py       in-memory numpy vector index built from the documents in the database
  services/            kb.py (upload, index), settings.py, auth.py, analytics.py, ratelimit.py
  ingest/              extract.py, clean.py, chunk.py, embed.py, naming.py, build_index.py, push.py
  rag/                 retriever.py, prompt.py, generator.py (any OpenAI-compatible model), pipeline.py
  api/main.py          app setup; routes in api/routes/ (chat, public, admin_*)
  eval/                metrics.py, judge.py, run_eval.py
tests/                 backend tests (pytest)
data/
  raw_docs/            the 24 source documents
  processed/           chunks.jsonl, embeddings_*.npy: the first-run import (page caches are not committed)
  eval/eval_set.json   62 evaluation questions with ground truth
frontend/              React + Vite app (frontend/dist is the production build)
  src/admin/           the admin console (loaded only at /admin)
render.yaml            one-click deployment blueprint for Render
```

## Run it on your machine

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env          # then put your GROQ_API_KEY, ADMIN_EMAIL, ADMIN_PASSWORD in .env
uvicorn app.api.main:app --reload
```

Open http://127.0.0.1:8000, and http://127.0.0.1:8000/admin for the admin console. The first start
creates `data/app.db` and imports the documents from `data/processed/`. After that, manage
documents in the admin console. `python -m app.ingest.build_index` still rebuilds
`data/processed/` from `data/raw_docs/` (stop the server first), and
`python -m app.ingest.push --all` loads that into the database.
OCR for scanned PDFs needs Tesseract installed (https://github.com/UB-Mannheim/tesseract/wiki).
Run the tests with `pytest`.

To work on the interface: `cd frontend`, `npm install`, `npm run dev` (proxies `/api` to port
8000), and `npm run build` to refresh `frontend/dist`. See `frontend/README.md`.

## Evaluate it

```bash
python -m app.eval.run_eval --retrieval-only --modes dense hybrid   # retrieval only, no Groq calls
python -m app.eval.run_eval                                         # full answers + LLM judge
```

Retrieval is scored with Hit@k, Recall@k and MRR against evidence phrases (independent of chunk
boundaries). Answers are graded by a judge from a different model family for correctness,
faithfulness and correct refusals. Reports are saved in `data/eval/results/`.

## Admin console

Sign in at `/admin` with the account created from `ADMIN_EMAIL` and `ADMIN_PASSWORD` on first start
(a super admin). Super admins can add more admins. Editors manage documents, settings and insights;
only super admins manage people and models (models decide where API keys are sent).

- **Documents**: drag files in (PDF, Word, HTML, Markdown, text; up to 10 MB). They are read, split
  and indexed in the background and go live within a minute. Hide, rename, replace or delete them.
  The page-text editor fixes misread words or lets you type a scanned page.
- **Test search**: shows which passages the assistant would use for a question, without calling a model.
- **Insights**: questions the documents could not answer (gaps to fill) and answers rated poor.
- **Models**: add providers (Groq, OpenRouter, or a local Ollama server) and models, choose the
  default and the fallback, test each one, and decide whether students may choose.
- **Settings**: app name, notice, contacts, announcement banner, suggested questions, usage limit.

Scanned PDFs: the web server has no OCR. Read them on your computer (with Tesseract installed and
`DATABASE_URL` pointing at the online database) using `python -m app.ingest.push file.pdf`, or type
the text of each page in the page editor.

### A model with no usage limit

Hosted free tiers always have limits. A model on a computer you run, using Ollama, has none. Install
Ollama, run `ollama pull llama3.2:3b`, then in Models add the Ollama provider (address
`http://localhost:11434/v1`) and the model, test it, and set it as the fallback so students are
served when Groq is busy. It must be reachable from the server, so it cannot run on the free Render
service itself (512 MB). On a hosted server, addresses on a private network are blocked unless
you set `ALLOW_LOCAL_MODEL_HOSTS=true`. Small models give weaker answers: run the evaluation before using one as
the default.

## Groq free-tier limits

Each model allows about 8,000 tokens per minute and 200,000 per day, and one answer uses about
3,000. `app/rag/generator.py` spaces requests out, and switches to the fallback model (which has
its own quota) when the main model is busy. Providers without a token limit, such as a local model,
are never held back. For heavier use, upgrade the Groq plan.

## Deploy

`render.yaml` deploys the whole app (API plus frontend) as a single Render web service on the free
plan, using the smaller `bge-small` embedding model so it fits in 512 MB. Render's disk is wiped at
every restart, so documents, settings and statistics live in a free Postgres database instead.

1. Create a free project at https://neon.tech (or Supabase) and copy its connection string. Change
   its start to `postgresql+psycopg://`.
2. In Render's environment settings set `DATABASE_URL` (that string), `GROQ_API_KEY`,
   `ADMIN_EMAIL` and `ADMIN_PASSWORD`. `SECRET_KEY` is generated for you. Never commit `.env`.
3. Deploy. The first start imports the 24 documents into the database; open `/admin` and sign in.
   Change the admin password in Settings.

`REQUIRE_DATABASE=true` makes the server refuse to start without `DATABASE_URL`, so uploads can
never be lost silently. To avoid a slow first request after idle time (the free service sleeps),
point a free uptime pinger such as cron-job.org at `/api/health` every 10 minutes.
