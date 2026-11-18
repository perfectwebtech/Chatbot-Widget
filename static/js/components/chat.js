/**
 * Core chat behaviour: rendering user and bot messages, talking to the Rasa
 * REST channel and wiring up the input controls.
 *
 * All text coming from the user or the bot is inserted either as text nodes
 * or as DOMPurify-sanitised HTML. Never concatenate it into HTML strings.
 */

/** Conversation id sent to Rasa as `sender`. */
const senderId =
  window.crypto && typeof window.crypto.randomUUID === "function"
    ? window.crypto.randomUUID()
    : uuidv4();

/** Tags that make a bot message render as a block (span) instead of a paragraph. */
const BLOCK_TAG_PATTERN = /<(blockquote|img|pre|code|ul|ol|li|h[1-6]|table)\b/i;

/**
 * Render the user's message on the chat screen and show the typing indicator.
 * @param {String} message user message
 */
function setUserResponse(message) {
  const nodes = [
    el("img", { class: "userAvatar", src: getConfig().userAvatar, alt: "" }),
    el("p", { class: "userMsg", text: message }),
    clearfix(),
  ];
  appendToChat(nodes);

  $(".usrInput").val("");
  showBotTyping();
  $(".suggestions").remove();
}

/**
 * Build a bot message bubble from Markdown text.
 * @param {String} text bot message (Markdown allowed)
 * @returns {Array<Node>}
 */
function buildBotTextMessage(text) {
  let html = markdownToSafeHtml(text);
  html = html
    .replaceAll("<p>", "")
    .replaceAll("</p>", "")
    .replaceAll("<strong>", "<b>")
    .replaceAll("</strong>", "</b>");
  html = html.replace(/(?:\r\n|\r|\n)/g, "<br>");

  const isBlock = BLOCK_TAG_PATTERN.test(html);
  if (isBlock) {
    // block-level markdown carries its own spacing
    html = html.replaceAll("<br>", "");
    html = html.replaceAll("<img", '<img class="imgcard_mrkdwn"');
  }
  // `html` has already been through DOMPurify; the replacements above only
  // touch tag names and classes, never attribute values.
  const bubble = el(isBlock ? "span" : "p", { class: "botMsg" });
  bubble.innerHTML = sanitizeHtml(html);
  return [botAvatarImg(), bubble, clearfix()];
}

/** Show the configured fallback message as a bot bubble. */
function showFallbackMessage() {
  appendToChat([
    botAvatarImg(),
    el("p", { class: "botMsg", text: getConfig().messages.fallback }),
    clearfix(),
  ]);
}

/**
 * Render an image response.
 * @param {String} url
 */
function renderImage(url) {
  if (!isSafeUrl(url)) {
    log("Ignoring image with unsafe URL", url);
    return;
  }
  appendToChat([
    el("div", { class: "singleCard" }, el("img", { class: "imgcard", src: url, alt: "" })),
    clearfix(),
  ]);
}

/**
 * Render a video attachment inside a sandboxed iframe.
 * @param {String} url
 */
function renderVideo(url) {
  if (!isSafeUrl(url)) {
    log("Ignoring video with unsafe URL", url);
    return;
  }
  const frame = el("iframe", {
    src: url,
    frameborder: "0",
    allow: "fullscreen; picture-in-picture",
    referrerpolicy: "strict-origin-when-cross-origin",
    sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
    title: "Video",
  });
  appendToChat(el("div", { class: "video-container" }, frame));
}

/**
 * Render a single Rasa `custom` payload.
 * @param {Object} message a Rasa response object with a `custom` key
 * @returns {Boolean} true when the payload type ends the rendering of this batch
 */
function renderCustomPayload(message) {
  const custom = message.custom || {};
  const { payload, data } = custom;

  switch (payload) {
    case "quickReplies":
      showQuickReplies(data || []);
      return true;
    case "pdf_attachment":
      renderPdfAttachment(message);
      return true;
    case "dropDown":
      renderDropDwon(data || []);
      return true;
    case "location":
      $("#userInput").prop("disabled", true);
      getLocation();
      scrollToBottomOfResults();
      return true;
    case "cardsCarousel":
      showCardsCarousel(data || []);
      return true;
    case "chart":
      renderChartMessage(data || {});
      return true;
    case "collapsible":
      createCollapsible(data || []);
      return false;
    default:
      log("Unknown custom payload", payload);
      return false;
  }
}

/**
 * Render a batch of bot responses on to the chat screen.
 * @param {Array} response json array of Rasa response objects
 *
 * for more info: `https://rasa.com/docs/rasa/connectors/your-own-website#request-and-response-format`
 */
function setBotResponse(response) {
  hideBotTyping();

  if (!Array.isArray(response) || response.length < 1) {
    showFallbackMessage();
    $(".usrInput").focus();
    return;
  }

  for (let i = 0; i < response.length; i += 1) {
    const message = response[i] || {};

    if (typeof message.text === "string" && message.text !== "") {
      appendToChat(buildBotTextMessage(message.text));
    }

    if (message.image) {
      renderImage(message.image);
    }

    if (Array.isArray(message.buttons) && message.buttons.length > 0) {
      addSuggestion(message.buttons);
    }

    if (message.attachment && message.attachment.type === "video") {
      const src = message.attachment.payload && message.attachment.payload.src;
      renderVideo(src);
    }

    if (message.custom) {
      const stop = renderCustomPayload(message);
      if (stop) return;
    }
  }

  scrollToBottomOfResults();
  $(".usrInput").focus();
}

/**
 * Remove interactive elements from previous turns before a new message is sent.
 */
function clearTransientElements() {
  $(".collapsible").remove();
  $(".dropDownMsg").remove();
  destroyCharts();
  $("#paginated_cards").remove();
  $(".suggestions").remove();
  $(".quickReplies").remove();
}

/**
 * Send the user message to the Rasa server.
 * @param {String} message user message or intent payload
 */
function send(message) {
  const config = getConfig();
  const isRestart = typeof message === "string" && message.toLowerCase() === "/restart";

  $.ajax({
    url: config.rasaServerUrl,
    type: "POST",
    contentType: "application/json",
    timeout: config.requestTimeoutMs,
    data: JSON.stringify({ message, sender: senderId }),
    success(botResponse, status) {
      log("Response from Rasa:", botResponse, "Status:", status);

      if (isRestart) {
        hideBotTyping();
        $("#userInput").prop("disabled", false);
        if (config.startConversation) {
          customActionTrigger();
        }
        return;
      }
      setBotResponse(botResponse);
    },
    error(xhr, textStatus) {
      reportError(textStatus, { stage: "send", status: xhr && xhr.status });
      $("#userInput").prop("disabled", false);
      setBotResponse([]);
    },
  });
}

/**
 * Ask the Rasa core server to execute an action so the bot speaks first.
 *
 * `Note: this method only works in Rasa 1.x`
 */
// eslint-disable-next-line no-unused-vars
function actionTrigger() {
  const config = getConfig();
  const base = new URL(config.rasaServerUrl, window.location.href);
  $.ajax({
    url: `${base.origin}/conversations/${senderId}/execute`,
    type: "POST",
    contentType: "application/json",
    timeout: config.requestTimeoutMs,
    data: JSON.stringify({
      name: config.startActionName,
      policy: "MappingPolicy",
      confidence: "0.98",
    }),
    success(botResponse, status) {
      log("Response from Rasa:", botResponse, "Status:", status);
      if (botResponse && Array.isArray(botResponse.messages)) {
        setBotResponse(botResponse.messages);
      }
      $("#userInput").prop("disabled", false);
    },
    error(xhr, textStatus) {
      reportError(textStatus, { stage: "actionTrigger", status: xhr && xhr.status });
      setBotResponse([]);
      $("#userInput").prop("disabled", false);
    },
  });
}

/**
 * Ask the custom action server to run `startActionName` so the bot speaks first.
 *
 * Make sure the action server allows this origin, e.g.
 * `rasa run actions --cors "https://www.example.com"`
 *
 * `Note: this method works in Rasa 2.x and later`
 */
function customActionTrigger() {
  const config = getConfig();
  showBotTyping();
  $.ajax({
    url: config.actionServerUrl,
    type: "POST",
    contentType: "application/json",
    timeout: config.requestTimeoutMs,
    data: JSON.stringify({
      next_action: config.startActionName,
      tracker: { sender_id: senderId },
    }),
    success(botResponse, status) {
      log("Response from action server:", botResponse, "Status:", status);
      if (botResponse && Array.isArray(botResponse.responses)) {
        setBotResponse(botResponse.responses);
      } else {
        hideBotTyping();
      }
      $("#userInput").prop("disabled", false);
    },
    error(xhr, textStatus) {
      reportError(textStatus, { stage: "customActionTrigger", status: xhr && xhr.status });
      setBotResponse([]);
      $("#userInput").prop("disabled", false);
    },
  });
}

/**
 * Clear the conversation from the chat screen and send `/restart` to Rasa.
 */
function restartConversation() {
  $("#userInput").prop("disabled", true);
  clearTransientElements();
  $(".chats").html("");
  $(".usrInput").val("");
  showBotTyping();
  send("/restart");
}

/** Read, validate and send whatever is in the input box. */
function submitUserInput() {
  const text = $(".usrInput").val();
  if (!text || $.trim(text) === "") return;
  clearTransientElements();
  $(".usrInput").blur();
  setUserResponse(text);
  send(text);
}

$(document).on("click", "#restart", (e) => {
  e.preventDefault();
  restartConversation();
});

// Enter sends, Shift+Enter inserts a newline.
$(document).on("keydown", ".usrInput", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitUserInput();
  }
});

$(document).on("click keydown", "#sendButton", (e) => {
  if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
  e.preventDefault();
  submitUserInput();
});
