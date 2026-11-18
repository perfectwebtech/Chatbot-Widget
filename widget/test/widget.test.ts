import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { init, ChatbotWidgetElement, register } from "../src/index";
import type { RasaMessage } from "../src/types";

function mockFetch(responder: (message: string) => unknown) {
  return vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { message: string };
    const out = responder(body.message);
    if (out instanceof Response) return out;
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("<chatbot-widget>", () => {
  let widget: ChatbotWidgetElement;
  let fetchSpy: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    register();
    localStorage.clear();
    fetchSpy = mockFetch((message) => {
      if (message === "/restart") return [];
      if (message === "empty") return [];
      if (message === "fail") return new Response("x", { status: 500 });
      if (message === "buttons")
        return [{ text: "Pick", buttons: [{ title: "<b>A</b>", payload: "/a" }] }];
      if (message === "/a") return [{ text: "you picked a" }];
      return [{ text: `echo: ${message}` }];
    });
    vi.stubGlobal("fetch", fetchSpy);
    widget = init({
      serverUrl: "https://bot/webhooks/rest/webhook",
      botName: "Ava",
      greeting: { enabled: false },
    });
  });

  afterEach(() => {
    widget.remove();
    vi.unstubAllGlobals();
  });

  const $ = (selector: string) => widget.shadowRoot!.querySelector<HTMLElement>(selector);
  const $$ = (selector: string) =>
    Array.from(widget.shadowRoot!.querySelectorAll<HTMLElement>(selector));

  it("renders inside a shadow root with the configured name", () => {
    expect(widget.shadowRoot).not.toBeNull();
    expect($(".cw-header__title")!.textContent).toBe("Ava");
    expect($(".cw-panel")!.hidden).toBe(true);
  });

  it("opens and closes, reflecting state on the host element", () => {
    widget.openChat();
    expect(widget.hasAttribute("open")).toBe(true);
    expect($(".cw-panel")!.hidden).toBe(false);
    widget.closeChat();
    expect(widget.hasAttribute("open")).toBe(false);
  });

  it("sends a message and renders the user and bot bubbles as text", async () => {
    widget.openChat();
    await widget.send("<img src=x onerror=alert(1)>hi");
    await flush();
    const user = $(".cw-bubble--user")!;
    expect(user.textContent).toBe("<img src=x onerror=alert(1)>hi");
    expect(user.querySelector("img")).toBeNull();
    expect($(".cw-bubble--bot")!.textContent).toContain("echo:");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("renders buttons as text and sends their payload on click", async () => {
    await widget.send("buttons");
    await flush();
    const chip = $(".cw-chip")!;
    expect(chip.textContent).toBe("<b>A</b>");
    expect(chip.querySelector("b")).toBeNull();
    chip.click();
    await flush();
    const bodies = fetchSpy.mock.calls.map(
      (call) => JSON.parse(String((call[1] as RequestInit).body)).message,
    );
    expect(bodies).toEqual(["buttons", "/a"]);
    expect($$(".cw-bubble--user").map((n) => n.textContent)).toEqual(["buttons", "<b>A</b>"]);
    expect($(".cw-buttons")).toBeNull();
  });

  it("shows the fallback message on an empty reply and on HTTP errors", async () => {
    await widget.send("empty");
    await flush();
    await widget.send("fail");
    await flush();
    const bots = $$(".cw-bubble--bot").map((n) => n.textContent?.trim());
    expect(bots).toEqual([widget.config.messages.fallback, widget.config.messages.fallback]);
  });

  it("persists the sender id across instances when enabled", () => {
    const first = widget.senderId;
    expect(first).toMatch(/[0-9a-f-]{36}/);
    const second = init({ serverUrl: "https://bot/x", greeting: { enabled: false } });
    expect(second.senderId).toBe(first);
    second.remove();
    const fresh = init({
      serverUrl: "https://bot/x",
      persistSession: false,
      greeting: { enabled: false },
    });
    expect(fresh.senderId).not.toBe(first);
    fresh.remove();
  });

  it("emits DOM events and calls onEvent", async () => {
    const seen: string[] = [];
    widget.addEventListener("chatbot-widget:message-sent", (e) =>
      seen.push((e as CustomEvent).detail.type),
    );
    widget.config = { ...widget.config, onEvent: (event) => seen.push(`hook:${event.type}`) };
    await widget.send("x");
    await flush();
    expect(seen).toContain("message-sent");
    expect(seen).toContain("hook:message-sent");
    expect(seen).toContain("hook:message-received");
  });

  it("restart clears the log and sends /restart", async () => {
    await widget.send("x");
    await flush();
    await widget.restart();
    await flush();
    expect($$(".cw-row")).toHaveLength(0);
    const bodies = fetchSpy.mock.calls.map(
      (call) => JSON.parse(String((call[1] as RequestInit).body)).message,
    );
    expect(bodies).toEqual(["x", "/restart"]);
  });

  it("receive() renders messages produced outside the transport and drops unsafe media", () => {
    const messages: RasaMessage[] = [
      { text: "a", image: "javascript:alert(1)" },
      { custom: { payload: "pdf_attachment", url: "javascript:alert(1)", title: "x" } },
      { custom: { payload: "pdf_attachment", url: "https://ok/x.pdf", title: "ok" } },
    ];
    widget.receive(messages);
    expect($$(".cw-image")).toHaveLength(0);
    expect($$(".cw-attachment")).toHaveLength(1);
    expect($(".cw-attachment")!.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("reads config from data attributes on the element", () => {
    const el = document.createElement("chatbot-widget") as ChatbotWidgetElement;
    el.dataset.botName = "Zed";
    el.dataset.position = "left";
    document.body.appendChild(el);
    expect(el.config.botName).toBe("Zed");
    expect(el.getAttribute("position")).toBe("left");
    el.remove();
  });
});

describe("<chatbot-widget> queueing", () => {
  it("delivers messages sent while a reply is pending, in order", async () => {
    register();
    const seen: string[] = [];
    let release: (() => void) | null = null;
    const fetchSpy = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const message = JSON.parse(String(init?.body)).message as string;
      seen.push(message);
      if (message === "slow") await new Promise<void>((r) => (release = r));
      return new Response(JSON.stringify([{ text: `echo: ${message}` }]), {
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchSpy);
    const widget = init({
      serverUrl: "https://bot/x",
      greeting: { enabled: false },
      persistSession: false,
    });
    const first = widget.send("slow");
    await new Promise((r) => setTimeout(r, 0));
    void widget.send("second");
    void widget.send("third");
    expect(seen).toEqual(["slow"]);
    release!();
    await first;
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual(["slow", "second", "third"]);
    const bots = Array.from(widget.shadowRoot!.querySelectorAll(".cw-bubble--bot")).map((n) =>
      n.textContent?.trim(),
    );
    expect(bots).toEqual(["echo: slow", "echo: second", "echo: third"]);
    widget.remove();
    vi.unstubAllGlobals();
  });
});
