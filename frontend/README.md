# UI Postgraduate Assistant: frontend

React 18 + Vite chat interface for the University of Ibadan Postgraduate AI Assistant. Requires Node 20.19 or newer.

## API used

| Endpoint | Purpose |
| --- | --- |
| `POST /api/chat/stream` | Main chat call. Server-Sent Events over `fetch`: `status`, `retrieved`, `token`, `done`, `error`. |
| `POST /api/chat` | Non-streaming fallback, used automatically if the stream route returns 404 or 405. |
| `GET /api/documents` | Knowledge-base panel and the welcome-screen stats. The UI works without it. |
| `GET /api/health` | Online indicator in the header. |

The stop button aborts the stream and keeps the text received so far. A stream that fails or goes silent for 30 seconds keeps its partial text and offers a retry.

## Install

```bash
cd frontend
npm install
```

## Run with the mock API (no backend needed)

Use two terminals:

```bash
npm run dev:mock     # mock API on http://127.0.0.1:8001
npm run dev:ui-mock  # Vite on http://localhost:5173, proxying /api to the mock
```

Words to type into a message to trigger behaviour in the mock:

- `error`: HTTP 500 on the plain route, an `error` event mid-answer on the stream
- `drop`: the stream connection is cut mid-answer (the Vite proxy may just leave it silent)
- `stall`: the stream goes quiet mid-answer, to see the 30 second timeout

To test the automatic fallback, start the mock with the stream route disabled:

```bash
NO_STREAM=1 npm run dev:mock                       # macOS / Linux
$env:NO_STREAM="1"; npm run dev:mock               # PowerShell
```

## Run against the real backend

Start the backend on port 8000, then:

```bash
npm run dev
```

To point at a different backend, set `VITE_API_TARGET`:

```bash
VITE_API_TARGET=http://127.0.0.1:9000 npm run dev          # macOS / Linux
$env:VITE_API_TARGET="http://127.0.0.1:9000"; npm run dev  # PowerShell
```

## Build

```bash
npm run build
```

The output goes to `frontend/dist`.

## Serving the build from FastAPI

The app uses relative URLs (`/api/...`), so it must be served from the same origin as the API. Mount `dist` after the API routes so `/api` keeps priority:

```python
from fastapi.staticfiles import StaticFiles

app.mount("/", StaticFiles(directory="frontend/dist", html=True), name="frontend")
```

Streaming needs the server not to buffer responses. If a reverse proxy sits in front, disable buffering for `/api/chat/stream` (for nginx, `proxy_buffering off;` or send an `X-Accel-Buffering: no` header).

## Layout

```text
src/
  App.jsx                 page layout, dialogs, keyboard shortcuts
  api.js                  fetch calls and the SSE reader
  pacer.js                steady reveal of streamed text
  format.js               relative time, day grouping, text for read-aloud
  exportChat.js           Markdown export
  topics.js               welcome topics and follow-up question rules
  documentKinds.js        icon and label inferred from a document name
  hooks/                  useConversations, useDocuments, useHealth, useTheme
  components/             Sidebar, Header, Welcome, MessageList, Message, Sources,
                          Composer, Dialog and the About, Knowledge base,
                          Shortcuts and Source dialogs
  styles.css              design tokens (light and dark) and all styles
public/ui-crest.png       University crest (see below)
dev-mock/server.mjs       mock API
```

## Branding

The crest in `public/ui-crest.png` was taken from the Postgraduate College site (`https://pgcollege.ui.edu.ng/logo.png`), cut out from its blue background and resized. The University's own site serves a smaller copy at `https://ui.edu.ng/sites/default/files/logo.gif`. The navy and gold in `styles.css` come from that crest and from the Postgraduate College stylesheet (`#0a2b4f` and gold). This is an unofficial student project, and the About dialog says so.

## Storage

Conversations and the theme are kept in `localStorage` (`ui-pg-conversations`, `ui-pg-theme`). Thumbs up/down feedback is stored there too and never sent anywhere.
