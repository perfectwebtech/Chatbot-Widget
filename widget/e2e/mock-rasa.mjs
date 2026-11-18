/**
 * Minimal stand-in for a Rasa server: REST webhook (plain and streamed) plus a
 * Socket.IO channel. Used by the demo page and the Playwright suite.
 *
 *   node e2e/mock-rasa.mjs            # listens on 127.0.0.1:5005
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_RASA_PORT ?? 5005);

const RESPONSES = {
  hello: [{ text: "Hello **there** 😀 How can I help?" }],
  md: [
    {
      text: "# Heading\n\n- one\n- two\n\n`code` and [a link](https://example.com)\n\n| a | b |\n|---|---|\n| 1 | 2 |",
    },
  ],
  buttons: [
    {
      text: "Pick one",
      buttons: [
        { title: "Great", payload: "/mood_great" },
        { title: "Sad", payload: "/mood_sad" },
      ],
    },
  ],
  quick: [
    {
      custom: {
        payload: "quickReplies",
        data: [
          { title: "Yes", payload: "/affirm" },
          { title: "No", payload: "/deny" },
        ],
      },
    },
  ],
  image: [{ text: "Here is a picture", image: "https://picsum.photos/seed/widget/400/240" }],
  video: [
    {
      attachment: { type: "video", payload: { src: "https://www.youtube.com/embed/Ntz2O0pDF5g" } },
    },
  ],
  pdf: [
    {
      custom: {
        payload: "pdf_attachment",
        url: "https://example.com/report.pdf",
        title: "Quarterly report",
      },
    },
  ],
  dropdown: [
    {
      custom: {
        payload: "dropDown",
        data: [
          { label: "Small", value: '/size{"size":"s"}' },
          { label: "Large", value: '/size{"size":"l"}' },
        ],
      },
    },
  ],
  collapsible: [
    {
      custom: {
        payload: "collapsible",
        data: [
          { title: "Opening hours", description: "Mon–Fri **9–17**" },
          { title: "Address", description: "1 Example Street" },
        ],
      },
    },
  ],
  cards: [
    {
      custom: {
        payload: "cardsCarousel",
        data: [
          {
            title: "Pizza",
            subtitle: "Italian",
            image: "https://picsum.photos/seed/a/300/200",
            payload: '/order{"dish":"pizza"}',
          },
          {
            title: "Sushi",
            subtitle: "Japanese",
            image: "https://picsum.photos/seed/b/300/200",
            url: "https://example.com/sushi",
          },
          { title: "Tacos", subtitle: "Mexican", image: "https://picsum.photos/seed/c/300/200" },
        ],
      },
    },
  ],
  chart: [
    {
      custom: {
        payload: "chart",
        data: {
          title: "Leaves",
          labels: ["Sick", "Casual", "Earned"],
          backgroundColor: ["#36a2eb", "#ffcd56", "#ff6384"],
          chartsData: [5, 10, 22],
          chartType: "pie",
          displayLegend: "true",
        },
      },
    },
  ],
  xss: [
    {
      text: '<img src=x onerror="window.__xss=1">pwned <script>window.__xss=2</script> [link](javascript:window.__xss=3)',
      buttons: [
        { title: '<img src=x onerror="window.__xss=4">btn', payload: "' onclick='window.__xss=5'" },
      ],
    },
    { image: "javascript:window.__xss=6" },
    {
      custom: { payload: "pdf_attachment", url: "javascript:window.__xss=7", title: "<i>pdf</i>" },
    },
    {
      custom: {
        payload: "collapsible",
        data: [
          {
            title: '<img src=x onerror="window.__xss=8">t',
            description: '<img src=x onerror="window.__xss=9">d',
          },
        ],
      },
    },
    {
      custom: {
        payload: "cardsCarousel",
        data: [
          {
            title: '<img src=x onerror="window.__xss=10">c',
            image: "javascript:window.__xss=11",
            url: "javascript:window.__xss=12",
          },
        ],
      },
    },
  ],
  empty: [],
  slow: [{ text: "That took a while" }],
  error: null,
};

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

const server = createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === "GET" && url.pathname === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end('{"ok":true}');
    return;
  }
  if (req.method !== "POST" || url.pathname !== "/webhooks/rest/webhook") {
    res.writeHead(404);
    res.end();
    return;
  }

  const body = JSON.parse((await readBody(req)) || "{}");
  const message = String(body.message ?? "");
  const sender = String(body.sender ?? "");
  const streaming = url.searchParams.get("stream") === "true";
  // echo back what the server saw so tests can assert on it
  const echo = {
    recipient_id: sender,
    custom: {
      payload: "__echo",
      auth: req.headers.authorization ?? null,
      token: url.searchParams.get("token"),
      metadata: body.metadata ?? null,
    },
  };

  if (message === "error") {
    res.writeHead(500);
    res.end("boom");
    return;
  }
  if (message === "slow") await new Promise((r) => setTimeout(r, 1500));

  let out = message === "/restart" ? [] : (RESPONSES[message] ?? [{ text: `echo: ${message}` }]);
  if (message === "echo") out = [echo];

  if (streaming) {
    // Rasa Pro style: one JSON object per line, text tokens as bare {text} lines
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    if (message === "stream") {
      const tokens = ["Streaming ", "tokens ", "**one** ", "by ", "one."];
      for (const token of tokens) {
        res.write(JSON.stringify({ recipient_id: sender, text: token }) + "\n");
        await new Promise((r) => setTimeout(r, 60));
      }
      res.write(
        JSON.stringify({ recipient_id: sender, buttons: [{ title: "More", payload: "/more" }] }) +
          "\n",
      );
      res.end();
      return;
    }
    for (const item of out) res.write(JSON.stringify({ recipient_id: sender, ...item }) + "\n");
    res.end();
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(out.map((item) => ({ recipient_id: sender, ...item }))));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`mock rasa listening on http://127.0.0.1:${PORT}`);
});
