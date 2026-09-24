# University of Ibadan Postgraduate AI Assistant

A Retrieval-Augmented Generation (RAG) chatbot that answers postgraduate students' questions
from official University of Ibadan documents, cites its sources, and says so when the
documents don't contain the answer.

## How it works

1. **Ingestion** (`app/ingest/`): every file in `data/raw_docs/` is extracted page by page
   (scanned pages are read with OCR), cleaned, split into overlapping chunks, and embedded with
   a local ONNX model (`fastembed`). Chunks and embeddings are saved in `data/processed/` and
   loaded into a Chroma vector database.
2. **Retrieval** (`app/rag/retriever.py`): a question is searched two ways, by meaning
   (embeddings) and by exact words (BM25), and the two rankings are merged (reciprocal rank
   fusion). Follow-up questions are first rewritten into standalone questions.
3. **Generation** (`app/rag/`): the top chunks go to a Groq-hosted LLM with strict rules: answer
   only from the context, cite `(Source: document, p.N)`, and admit when the answer isn't there.
   Answers stream to the browser token by token.
4. **Interface** (`frontend/`): a React chat app (streaming, sources with passages,
   conversation history, knowledge-base panel). The API serves the built app.

## Project layout

```
app/
  config.py            settings read from .env
  vectorstore.py       Chroma store; rebuilds itself from saved chunks and embeddings if empty
  ingest/              extract.py, clean.py, chunk.py, embed.py, build_index.py
  rag/                 retriever.py, prompt.py, generator.py (Groq + rate limits), pipeline.py
  api/main.py          /api/chat, /api/chat/stream, /api/documents, /api/health
  eval/                metrics.py, judge.py, run_eval.py
data/
  raw_docs/            the 24 source documents
  processed/           chunks.jsonl, embeddings_*.npy (page caches are generated, not committed)
  eval/eval_set.json   62 evaluation questions with ground truth
frontend/              React + Vite app (frontend/dist is the production build)
render.yaml            one-click deployment blueprint for Render
```

## Run it on your machine

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env          # then put your GROQ_API_KEY in .env
python -m app.ingest.build_index   # only needed when documents or chunk settings change
uvicorn app.api.main:app --reload
```

Open http://127.0.0.1:8000. Stop the server before re-running `build_index`.
OCR needs Tesseract installed (https://github.com/UB-Mannheim/tesseract/wiki).

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

## Groq free-tier limits

Each model allows about 8,000 tokens per minute and 200,000 per day, and one answer uses about
3,000. `app/rag/generator.py` spaces requests out, and switches to `GROQ_FALLBACK_MODEL` (which
has its own quota) when the main model is busy. For heavier use, upgrade the Groq plan.

## Deploy

`render.yaml` deploys the whole app (API plus frontend) as a single Render web service on the
free plan, using the smaller `bge-small` embedding model so it fits in 512 MB. Set
`GROQ_API_KEY` in Render's environment settings; never commit `.env`.
