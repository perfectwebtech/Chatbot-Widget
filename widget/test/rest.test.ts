import { describe, expect, it, vi } from "vitest";
import { RestTransport, toMessages } from "../src/transport/rest";
import { normalizeMessage } from "../src/transport/types";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function streamResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // deliberately split across chunk boundaries to exercise buffering
      const payload = lines.join("\n") + "\n";
      const mid = Math.floor(payload.length / 2);
      controller.enqueue(encoder.encode(payload.slice(0, mid)));
      controller.enqueue(encoder.encode(payload.slice(mid)));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

const base = {
  senderId: "abc",
  serverUrl: "https://bot.example.com/webhooks/rest/webhook",
  requestTimeoutMs: 1000,
};

describe("RestTransport", () => {
  it("posts sender, message and metadata and emits the parsed messages", async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body).toEqual({ sender: "abc", message: "hi", metadata: { plan: "pro", page: "/x" } });
      return jsonResponse([{ recipient_id: "abc", text: "hello" }]);
    });
    const transport = new RestTransport({ ...base, metadata: { plan: "pro" }, fetchImpl });
    const received = vi.fn();
    transport.on("message", received);
    await transport.send("hi", { metadata: { page: "/x" } });
    expect(received).toHaveBeenCalledWith([{ recipient_id: "abc", text: "hello" }]);
  });

  it("sends the auth token as a query parameter and the JWT as a bearer header", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      expect(String(url)).toContain("token=secret");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer jwt-1");
      return jsonResponse([]);
    });
    const transport = new RestTransport({
      ...base,
      authToken: "secret",
      jwt: async () => "jwt-1",
      fetchImpl,
    });
    await transport.send("hi");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("emits an error and rejects on HTTP failure", async () => {
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }));
    const transport = new RestTransport({ ...base, fetchImpl });
    const errors = vi.fn();
    transport.on("error", errors);
    await expect(transport.send("hi")).rejects.toThrow(/500/);
    expect(errors).toHaveBeenCalledTimes(1);
  });

  it("aborts after the timeout", async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    );
    const transport = new RestTransport({ ...base, requestTimeoutMs: 20, fetchImpl });
    await expect(transport.send("hi")).rejects.toThrow(/aborted/);
  });

  it("parses newline-delimited streamed responses into chunks and messages", async () => {
    const fetchImpl = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain("stream=true");
      return streamResponse([
        JSON.stringify({ recipient_id: "abc", text: "Hel" }),
        JSON.stringify({ recipient_id: "abc", text: "lo" }),
        JSON.stringify({ recipient_id: "abc", buttons: [{ title: "A", payload: "/a" }] }),
        JSON.stringify({ recipient_id: "abc", text: "Second" }),
        "data: " + JSON.stringify({ recipient_id: "abc", image: "https://x/y.png" }),
      ]);
    });
    const transport = new RestTransport({ ...base, streaming: true, fetchImpl });
    const events: string[] = [];
    transport.on("chunk", ({ text }) => events.push(`chunk:${text}`));
    transport.on("streamEnd", () => events.push("end"));
    transport.on("message", (messages) =>
      events.push(`msg:${Object.keys(messages[0]!).join(",")}`),
    );
    await transport.send("hi");
    expect(events).toEqual([
      "chunk:Hel",
      "chunk:lo",
      "end",
      "msg:recipient_id,buttons",
      "chunk:Second",
      "end",
      "msg:recipient_id,image",
    ]);
  });

  it("emits an empty message list when the stream carries nothing", async () => {
    const fetchImpl = vi.fn(async () => streamResponse([]));
    const transport = new RestTransport({ ...base, streaming: true, fetchImpl });
    const received = vi.fn();
    transport.on("message", received);
    await transport.send("hi");
    expect(received).toHaveBeenCalledWith([]);
  });
});

describe("toMessages", () => {
  it("accepts arrays, wrapped objects and single messages", () => {
    expect(toMessages([{ text: "a" }])).toEqual([{ text: "a" }]);
    expect(toMessages({ messages: [{ text: "a" }] })).toEqual([{ text: "a" }]);
    expect(toMessages({ responses: [{ text: "a" }] })).toEqual([{ text: "a" }]);
    expect(toMessages({ text: "a" })).toEqual([{ text: "a" }]);
    expect(toMessages({ foo: 1 })).toEqual([]);
    expect(toMessages("nope")).toEqual([]);
  });
});

describe("normalizeMessage", () => {
  it("maps Socket.IO shapes to the REST shape", () => {
    expect(
      normalizeMessage({
        text: "t",
        quick_replies: [{ content_type: "text", title: "A", payload: "/a" }],
      }),
    ).toMatchObject({ text: "t", buttons: [{ title: "A", payload: "/a" }] });
    expect(
      normalizeMessage({ attachment: { type: "image", payload: { src: "https://x/y.png" } } }),
    ).toMatchObject({
      image: "https://x/y.png",
    });
    expect(normalizeMessage({ payload: "cardsCarousel", data: [{ title: "x" }] })).toEqual({
      custom: { payload: "cardsCarousel", data: [{ title: "x" }] },
    });
  });

  it("leaves REST messages untouched", () => {
    const message = { recipient_id: "a", text: "x", custom: { payload: "chart", data: {} } };
    expect(normalizeMessage(message)).toEqual(message);
    expect(normalizeMessage(null)).toBeNull();
  });
});
