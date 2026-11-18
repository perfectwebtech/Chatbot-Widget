import { describe, expect, it } from "vitest";
import { configFromDataset, DEFAULT_CONFIG, resolveConfig } from "../src/config";

describe("resolveConfig", () => {
  it("returns defaults when nothing is passed", () => {
    const config = resolveConfig();
    expect(config.transport).toBe("rest");
    expect(config.messages.fallback).toBe(DEFAULT_CONFIG.messages.fallback);
  });

  it("deep merges messages and greeting without dropping defaults", () => {
    const config = resolveConfig({
      botName: "Ava",
      messages: { fallback: "Oops" },
      greeting: { text: "Hi" },
    });
    expect(config.botName).toBe("Ava");
    expect(config.messages.fallback).toBe("Oops");
    expect(config.messages.send).toBe(DEFAULT_CONFIG.messages.send);
    expect(config.greeting.text).toBe("Hi");
    expect(config.greeting.title).toBe(DEFAULT_CONFIG.greeting.title);
  });

  it("ignores undefined overrides", () => {
    const config = resolveConfig({ botName: undefined, serverUrl: "https://x" });
    expect(config.botName).toBe(DEFAULT_CONFIG.botName);
    expect(config.serverUrl).toBe("https://x");
  });
});

describe("configFromDataset", () => {
  it("coerces booleans, numbers and JSON and supports dotted keys", () => {
    const config = configFromDataset({
      serverUrl: "https://bot.example.com/webhooks/rest/webhook",
      streaming: "true",
      requestTimeoutMs: "5000",
      "greeting.text": "Hello",
      "messages.fallback": "Nope",
      metadata: '{"plan":"pro"}',
    });
    expect(config.serverUrl).toBe("https://bot.example.com/webhooks/rest/webhook");
    expect(config.streaming).toBe(true);
    expect(config.requestTimeoutMs).toBe(5000);
    expect(config.greeting?.text).toBe("Hello");
    expect(config.messages?.fallback).toBe("Nope");
    expect(config.metadata).toEqual({ plan: "pro" });
  });

  it("keeps non-numeric strings as strings", () => {
    const config = configFromDataset({ botName: "007", senderId: "1e5" });
    expect(config.botName).toBe(7);
    expect(config.senderId).toBe("1e5");
  });
});
