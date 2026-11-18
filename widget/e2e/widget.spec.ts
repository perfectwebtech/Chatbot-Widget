import { expect, test, type Page } from "@playwright/test";

/** Query inside the widget's shadow root (Playwright pierces shadow DOM by default). */
const widget = (page: Page) => page.locator("chatbot-widget");

async function openAndSend(page: Page, text: string) {
  const w = widget(page);
  if ((await w.getAttribute("open")) === null) await w.locator(".cw-launcher").click();
  await w.locator(".cw-input").fill(text);
  await w.locator(".cw-input").press("Enter");
}

test.beforeEach(async ({ page }) => {
  page.on("dialog", (dialog) => dialog.dismiss());
});

test("loads isolated from host CSS and answers a message", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/e2e/pages/es.html");
  const w = widget(page);
  await expect(w.locator(".cw-launcher")).toBeVisible();

  // host page forces Comic Sans + red buttons; the widget must keep its own styles
  const font = await w.locator(".cw-launcher").evaluate((el) => getComputedStyle(el).fontFamily);
  expect(font).not.toContain("Comic Sans");
  const bg = await w.locator(".cw-launcher").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgb(255, 0, 0)");

  await openAndSend(page, "hello");
  await expect(w.locator(".cw-bubble--bot").first()).toContainText("Hello there");
  await expect(w.locator(".cw-bubble--bot strong")).toHaveText("there");
  expect(errors).toEqual([]);
});

test("renders every rich message type", async ({ page }) => {
  await page.goto("/e2e/pages/es.html");
  const w = widget(page);
  await openAndSend(page, "buttons");
  await expect(w.locator(".cw-chip")).toHaveCount(2);
  await w.locator(".cw-chip", { hasText: "Great" }).click();
  await expect(w.locator(".cw-bubble--user").last()).toHaveText("Great");
  await expect(w.locator(".cw-chip")).toHaveCount(0);

  await openAndSend(page, "quick");
  await expect(w.locator(".cw-buttons--row .cw-chip")).toHaveCount(2);

  await openAndSend(page, "dropdown");
  await w.locator(".cw-select").selectOption({ label: "Large" });
  await expect(w.locator(".cw-bubble--user").last()).toHaveText("Large");

  await openAndSend(page, "collapsible");
  await expect(w.locator("details")).toHaveCount(2);
  await w.locator("summary").first().click();
  await expect(w.locator(".cw-collapsible__body strong").first()).toHaveText("9–17");

  await openAndSend(page, "cards");
  await expect(w.locator(".cw-carousel__card")).toHaveCount(3);
  await w.locator(".cw-carousel__card").first().click();
  await expect(w.locator(".cw-bubble--user").last()).toHaveText("Pizza");

  await openAndSend(page, "pdf");
  await expect(w.locator(".cw-attachment")).toHaveAttribute(
    "href",
    "https://example.com/report.pdf",
  );

  await openAndSend(page, "chart");
  await expect(w.locator(".cw-chart canvas")).toBeVisible();
  await w.locator(".cw-chart__expand").click();
  await expect(w.locator(".cw-modal")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(w.locator(".cw-modal")).toBeHidden();

  await openAndSend(page, "md");
  await expect(w.locator(".cw-bubble--bot table").last()).toBeVisible();
});

test("neutralises XSS in every message channel", async ({ page }) => {
  await page.goto("/e2e/pages/es.html");
  const w = widget(page);
  await openAndSend(page, "xss");
  await expect(w.locator(".cw-chip")).toHaveCount(1);
  await expect(w.locator(".cw-chip")).toHaveText('<img src=x onerror="window.__xss=4">btn');
  await expect(w.locator(".cw-image")).toHaveCount(0);
  await expect(w.locator(".cw-attachment")).toHaveCount(0);
  await expect(w.locator("details")).toHaveCount(1);
  await w.locator(".cw-chip").click();
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => (window as unknown as { __xss?: number }).__xss),
  ).toBeUndefined();
  const live = await w.locator(".cw-log").evaluate((el) => ({
    handlers: el.querySelectorAll("[onerror],[onclick],[onload],[onmouseover],script,iframe")
      .length,
    badUrls: Array.from(el.querySelectorAll("[href],[src]")).filter((n) =>
      /^\s*(javascript|data|vbscript):/i.test(
        n.getAttribute("href") ?? n.getAttribute("src") ?? "",
      ),
    ).length,
  }));
  expect(live).toEqual({ handlers: 0, badUrls: 0 });
});

test("streams tokens when streaming is enabled", async ({ page }) => {
  await page.goto("/e2e/pages/es.html?streaming=true");
  const w = widget(page);
  await openAndSend(page, "stream");
  await expect(w.locator(".cw-bubble--streaming")).toBeVisible();
  await expect(w.locator(".cw-bubble--bot").first()).toContainText("Streaming tokens one by one.");
  await expect(w.locator(".cw-bubble--bot strong").first()).toHaveText("one");
  await expect(w.locator(".cw-bubble--streaming")).toHaveCount(0);
  await expect(w.locator(".cw-chip")).toHaveText("More");
  await expect(w.locator(".cw-bubble--bot")).toHaveCount(1);
});

test("keyboard: launcher, Escape, Enter and Shift+Enter", async ({ page }) => {
  await page.goto("/e2e/pages/es.html");
  const w = widget(page);
  await w.locator(".cw-launcher").focus();
  await page.keyboard.press("Enter");
  await expect(w.locator(".cw-panel")).toBeVisible();
  await expect(w.locator(".cw-input")).toBeFocused();
  await page.keyboard.type("line one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line two");
  await expect(w.locator(".cw-bubble--user")).toHaveCount(0);
  await page.keyboard.press("Enter");
  await expect(w.locator(".cw-bubble--user")).toHaveText("line one\nline two");
  await page.keyboard.press("Escape");
  await expect(w.locator(".cw-panel")).toBeHidden();
  await expect(w.locator(".cw-launcher")).toBeFocused();
});

test("shows the fallback on server errors and recovers", async ({ page }) => {
  await page.goto("/e2e/pages/es.html");
  const w = widget(page);
  await openAndSend(page, "error");
  await expect(w.locator(".cw-bubble--bot").last()).toHaveText(/something went wrong/);
  await openAndSend(page, "hello");
  await expect(w.locator(".cw-bubble--bot").last()).toContainText("Hello there");
});

test("sends auth token, bearer JWT and metadata", async ({ page }) => {
  await page.goto("/e2e/pages/es.html");
  await page.evaluate(() => {
    const w = document.querySelector("chatbot-widget") as HTMLElement & {
      config: Record<string, unknown>;
    };
    w.config = {
      ...w.config,
      authToken: "tok",
      jwt: () => Promise.resolve("jwt-1"),
      metadata: () => ({ page: location.pathname }),
    };
  });
  const w = widget(page);
  await openAndSend(page, "echo");
  // the mock echoes what it received as an unknown custom payload; read it from the request instead
  const [request] = await Promise.all([
    page.waitForRequest((r) => r.url().includes("/webhooks/rest/webhook")),
    openAndSend(page, "echo"),
  ]);
  expect(request.url()).toContain("token=tok");
  expect(request.headers().authorization).toBe("Bearer jwt-1");
  expect(request.postDataJSON().metadata).toEqual({ page: "/e2e/pages/es.html" });
  await expect(w.locator(".cw-bubble--user").last()).toHaveText("echo");
});

test("single script tag auto-initialises from data attributes", async ({ page }) => {
  await page.goto("/e2e/pages/iife.html");
  const w = widget(page);
  await expect(w).toHaveAttribute("position", "left");
  await expect(w.locator(".cw-header__title")).toHaveText("Tagged");
  const bg = await w.locator(".cw-launcher").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe("rgb(10, 125, 74)");
  expect(
    await page.evaluate(
      () =>
        typeof (window as unknown as { ChatbotWidget?: { init?: unknown } }).ChatbotWidget?.init,
    ),
  ).toBe("function");
  await openAndSend(page, "hello");
  await expect(w.locator(".cw-bubble--bot").first()).toContainText("Hello there");
});
