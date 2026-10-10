# UI Postgraduate Assistant: frontend

React 18 + Vite app with two parts: the student chat (`/`) and the admin console (`/admin`). The admin code is loaded only when someone opens `/admin`, so students never download it. It is also an installable app (manifest, icons and a small service worker). Requires Node 20.19 or newer.

## API used

Student app:

| Endpoint | Purpose |
| --- | --- |
| `POST /api/chat/stream` | Main chat call. Server-Sent Events over `fetch`: `status`, `retrieved`, `token`, `done`, `error`. |
| `POST /api/chat` | Non-streaming fallback, used automatically if the stream route returns 404 or 405. |
| `GET /api/config` | App name, notice, contacts, announcement, suggested questions and the models students may choose. |
| `GET /api/documents` | The "Official documents" panel and links to the originals. |
| `POST /api/feedback` | Thumbs up or down on an answer. |
| `GET /api/health` | Used to show a "waking up" notice when the server is asleep. |

Admin console: everything under `/api/admin/*` (see `src/admin/adminApi.js`), authenticated with a cookie set at sign-in.

The stop button aborts the stream and keeps the text received so far. A stream that fails or goes silent for 30 seconds keeps its partial text and offers a retry.

## Run it

Start the backend on port 8000 (see the main README), then:

```bash
cd frontend
npm install
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

The output goes to `frontend/dist`, which is committed because the server serves it. The build also gives the service worker a new cache name (`scripts/stamp-sw.mjs`), so each release replaces the old saved files.

The app uses relative URLs (`/api/...`), so it must be served from the same origin as the API. The backend does this and falls back to `index.html` for app routes such as `/admin/documents`.

Streaming needs the server not to buffer responses. If a reverse proxy sits in front, disable buffering for `/api/chat/stream` (for nginx, `proxy_buffering off;` or send an `X-Accel-Buffering: no` header).

## Layout

```text
src/
  main.jsx                routes: the student app, and the admin console (loaded on demand)
  App.jsx                 page layout, dialogs, keyboard shortcuts
  api.js                  fetch calls and the SSE reader
  pacer.js                steady reveal of streamed text
  format.js               relative time, day grouping, text for read-aloud
  exportChat.js           Markdown export
  topics.js               topic icons and follow-up question rules
  documentKinds.js        icon and label inferred from a document name
  hooks/                  useConversations, useConfig, useDocuments, useHealth,
                          useInstallPrompt, useTheme
  components/             Sidebar, Header, Banners, Welcome, MessageList, Message,
                          Sources, Composer, Dialog and the About, Documents,
                          Shortcuts and Source dialogs
  admin/                  the admin console (sign-in, pages, shared pieces, admin.css)
  styles.css, extras.css  design tokens (light and dark) and the student styles
public/                   crest, app icons, manifest.webmanifest, sw.js, theme-init.js, robots.txt
scripts/stamp-sw.mjs      runs after the build (see above)
```

## Branding

The crest in `public/ui-crest.png` is the University's official crest (`UI LOGO Original.png`, 276 x 330 px, from https://computing.ui.edu.ng/sites/default/files/UI%20LOGO%20Original.png; the same artwork is used on the student portal), enlarged 3x with edge-aware resampling. No larger official copy exists online. The navy and gold in `styles.css` come from the crest and the Postgraduate College stylesheet (`#0a2b4f` and gold). The app name, notice and contacts are edited by an admin in Settings, not in code.

## Storage

Conversations, the theme, the chosen model and the last settings from the server are kept in the browser's `localStorage` (`ui-pg-conversations`, `ui-pg-theme`, `ui-pg-model`, `ui-pg-config`). Thumbs up or down is also sent to the server, so admins can see which answers need work.
