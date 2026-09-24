// Tiny stand-in for the real backend so the UI can be developed without the RAG pipeline.
// Routes: GET /api/health, GET /api/documents, POST /api/chat, POST /api/chat/stream (SSE).
//
// Try these in a message:
//   "error"  -> the plain route returns HTTP 500; the stream sends an error event mid-answer
//   "drop"   -> the stream connection is cut mid-answer (through the Vite proxy it may just go silent)
//   "stall"  -> the stream goes silent mid-answer, without closing
// Start with NO_STREAM=1 to make /api/chat/stream return 404 and test the fallback.
import http from "node:http";

const PORT = 8001;
const DELAY_MS = 1500;
const NO_STREAM = process.env.NO_STREAM === "1";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ANSWERS = [
  {
    match: /thesis|copies|submit/i,
    answer:
      "You must submit **the following copies** of your thesis after your final oral examination:\n\n" +
      "- **Four (4) hard-bound copies** to the Postgraduate College (Source: Postgraduate Handbook, p.44)\n" +
      "- **One (1) soft copy** in PDF format on CD or by email (Source: Thesis Dissertation Manual of Style, p.12)\n" +
      "- A signed **certification page** from your supervisor and the Head of Department (Source: Postgraduate Handbook, p.45)\n\n" +
      "Submit within **six weeks** of the oral examination, otherwise your result may be withheld.",
    retrieved: [
      { document: "Postgraduate Handbook", page: 44 },
      { document: "Thesis Dissertation Manual of Style", page: 12 },
      { document: "Postgraduate Handbook", page: 45 },
      { document: "PG College Policy", page: 8 },
    ],
    sources: [
      {
        document: "Postgraduate Handbook",
        page: 44,
        snippet:
          "After the final oral examination and incorporation of all corrections, the candidate shall submit four (4) hard-bound copies of the thesis to the Postgraduate College through the Faculty Postgraduate Committee, together with one soft copy in PDF format.",
      },
      {
        document: "Postgraduate Handbook",
        page: 45,
        snippet:
          "Each copy must carry the signed certification page of the supervisor(s) and the Head of Department. Theses submitted more than six weeks after the oral examination may not be processed for the award of the degree.",
      },
      {
        document: "Thesis Dissertation Manual of Style",
        page: 12,
        snippet:
          "The soft copy shall be a single PDF file that is identical to the approved hard-bound copies, including the title page, abstract, table of contents, references and appendices.",
      },
    ],
  },
  {
    match: /fee|acceptance/i,
    answer:
      "The acceptance fee is a **non-refundable payment** made once you accept your admission offer (Source: Admission Guide 2021 2022, p.18).\n\n" +
      "1. Log in to the admission portal\n" +
      "2. Generate your acceptance fee invoice\n" +
      "3. Pay online and print the receipt\n\n" +
      "Check the current amount in the **Fee Schedule**, since it can change each session (Source: Fee Schedule, p.2).",
    retrieved: [
      { document: "Admission Guide 2021 2022", page: 18 },
      { document: "Fee Schedule", page: 2 },
    ],
    sources: [
      {
        document: "Admission Guide 2021 2022",
        page: 18,
        snippet:
          "Candidates who have been offered admission are required to pay a non-refundable acceptance fee through the university portal within the period stated in the admission letter, failing which the offer lapses.",
      },
      {
        document: "Fee Schedule",
        page: 2,
        snippet: "Acceptance fee, registration fee and other charges for the session are listed in the tables below. All payments are made online.",
      },
    ],
  },
  {
    match: /calendar|session|start|dates?/i,
    answer:
      "The **2025/2026 academic session** calendar lists these key dates (Source: Academic Calendar 2025 2026, p.1):\n\n" +
      "- Registration opens at the start of the first semester\n" +
      "- Late registration attracts a penalty fee\n" +
      "- Thesis submission deadlines follow the Postgraduate College schedule\n\n" +
      "Any later changes are announced in the calendar amendment (Source: Academic Calendar Amendment, p.1).",
    retrieved: [
      { document: "Academic Calendar 2025 2026", page: 1 },
      { document: "Academic Calendar Amendment", page: 1 },
    ],
    sources: [
      {
        document: "Academic Calendar 2025 2026",
        page: 1,
        snippet: "Postgraduate registration, lectures, examinations and thesis submission deadlines for the 2025/2026 session are set out below.",
      },
      { document: "Academic Calendar Amendment", page: 1, snippet: "" },
    ],
  },
  {
    match: /conversion|convert|mphil/i,
    answer:
      "To convert from MPhil to PhD you must:\n\n" +
      "1. Complete the **Form Request for MPhil PhD Conversion Examination** (Source: Form Request for MPhil PhD Conversion Examination, p.1)\n" +
      "2. Get your supervisor's and Head of Department's signatures\n" +
      "3. Present your work at the conversion examination",
    retrieved: [{ document: "Form Request for MPhil PhD Conversion Examination", page: 1 }],
    sources: [
      {
        document: "Form Request for MPhil PhD Conversion Examination",
        page: 1,
        snippet: "The candidate requests to be examined for conversion of registration from MPhil to PhD. The form must be endorsed by the supervisor and the Head of Department.",
      },
    ],
  },
  {
    match: /^\s*(hi|hello|hey|good (morning|afternoon|evening))\b/i,
    answer:
      "Hello! 👋 I'm the University of Ibadan Postgraduate Assistant. Ask me about admission, registration, fees, thesis submission or examinations.",
    retrieved: [],
    sources: [],
  },
  {
    match: /pass ?mark|grade/i,
    answer:
      "The pass mark for a postgraduate course is **50%** (Source: PG College Policy, p.21). Scores below this are recorded as a fail and the course must be repeated.",
    retrieved: [{ document: "PG College Policy", page: 21 }],
    sources: [
      {
        document: "PG College Policy",
        page: 21,
        snippet: "The pass mark for all postgraduate courses shall be 50 percent. A candidate who scores below the pass mark shall repeat the course.",
      },
    ],
  },
];

const NOT_FOUND = {
  answer:
    "I could not find this in the official University of Ibadan documents I have. Please contact the Postgraduate College directly for a reliable answer.",
  retrieved: [{ document: "Postgraduate Handbook", page: null }],
  sources: [],
};

const DOCUMENTS = [
  ["Postgraduate Handbook", 88, 210],
  ["Thesis Dissertation Manual of Style", 54, 120],
  ["Fee Schedule", 6, 14],
  ["Academic Calendar 2024 2025", 4, 10],
  ["Academic Calendar Amendment", 2, 4],
  ["Academic Calendar 2025 2026", 4, 10],
  ["PG College Policy", 32, 75],
  ["Admission Guide 2021 2022", 40, 96],
  ["Academic Regulations for Higher Degrees", 46, 104],
  ["Research Ethics Policy", 12, 27],
  ["Anti Plagiarism Policy", 9, 21],
  ["Postgraduate Diploma Regulations", 14, 31],
  ["Orientation Programme Schedule", 3, 7],
  ["Scholarship and Bursary Information", 5, 12],
  ["Form Request for MPhil PhD Conversion Examination", 3, 6],
  ["Form Clearance", 2, 4],
  ["Form Change of Supervisor", 2, 3],
  ["Form Application for Extension of Registration", 2, 4],
  ["Form Application for Leave of Absence", 2, 4],
  ["Form Thesis Submission Clearance", 2, 5],
  ["Plagiarism Detection Workshop Material", 28, 61],
  ["Guidelines for Preparing Examiners Joint Report", 7, 16],
  ["Guidelines for Postgraduate Supervision", 16, 35],
  ["Guidelines for Oral Examination", 8, 18],
].map(([name, pages, chunks]) => ({ name, pages, chunks }));

function pickAnswer(message) {
  return ANSWERS.find((a) => a.match.test(message)) || NOT_FOUND;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, status, body) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleChat(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 422, { detail: "Invalid JSON" });
  }
  const message = String(body.message || "");
  console.log(`chat: "${message}" (history: ${(body.history || []).length})`);

  await sleep(DELAY_MS);
  if (/error/i.test(message)) return sendJson(res, 500, { detail: "Simulated failure" });

  const { answer, sources } = pickAnswer(message);
  sendJson(res, 200, { answer, sources: sources.map(({ document, page }) => ({ document, page })) });
}

async function handleStream(req, res) {
  let body;
  try {
    body = await readBody(req);
  } catch {
    return sendJson(res, 422, { detail: "Invalid JSON" });
  }
  const message = String(body.message || "");
  console.log(`stream: "${message}" (history: ${(body.history || []).length})`);

  let closed = false;
  res.on("close", () => (closed = true));

  cors(res);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const emit = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);

  const { answer, retrieved, sources } = pickAnswer(message);

  emit("status", { stage: "searching" });
  await sleep(600);
  if (retrieved.length > 0) emit("retrieved", { documents: retrieved });
  await sleep(900);
  emit("status", { stage: "writing" });

  const tokens = answer.match(/\S+\s*|\s+/g);
  let index = 0;
  while (index < tokens.length && !closed) {
    if (/error/i.test(message) && index >= 8) {
      emit("error", { message: "Simulated failure" });
      return res.end();
    }
    if (/drop/i.test(message) && index >= 8) return res.destroy();
    if (/stall/i.test(message) && index >= 8) return; // leave the connection open and silent

    // Now and then send several tokens at once, like a real model does.
    const burst = Math.random() < 0.1 ? 6 + Math.floor(Math.random() * 5) : 1;
    for (let n = 0; n < burst && index < tokens.length; n++) emit("token", { text: tokens[index++] });
    await sleep(30 + Math.random() * 30);
  }

  if (closed) return;
  emit("done", { answer, sources });
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") return sendJson(res, 204, {});

  if (req.method === "GET" && req.url === "/api/health") return sendJson(res, 200, { status: "ok" });

  if (req.method === "GET" && req.url === "/api/documents") {
    const total_chunks = DOCUMENTS.reduce((sum, doc) => sum + doc.chunks, 0);
    return sendJson(res, 200, { documents: DOCUMENTS, total_chunks });
  }

  if (req.method === "POST" && req.url === "/api/chat/stream") {
    if (NO_STREAM) return sendJson(res, 404, { detail: "Not found" });
    return handleStream(req, res);
  }

  if (req.method === "POST" && req.url === "/api/chat") return handleChat(req, res);

  sendJson(res, 404, { detail: "Not found" });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Mock API running on http://127.0.0.1:${PORT}${NO_STREAM ? " (stream endpoint disabled)" : ""}`);
});
