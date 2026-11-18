/**
 * Chatbot widget configuration.
 *
 * Every deployable setting lives here. Nothing else in the widget needs to
 * be edited to point it at a different Rasa server or to rebrand it.
 *
 * A host page can override any key by defining `window.CHATBOT_CONFIG`
 * BEFORE this file is loaded, for example:
 *
 *   <script>
 *     window.CHATBOT_CONFIG = { rasaServerUrl: "https://bot.example.com/webhooks/rest/webhook", botName: "Ava" };
 *   </script>
 *   <script src="static/js/config.js"></script>
 */
(function initChatbotConfig(global) {
  const defaults = {
    // --- Backend -----------------------------------------------------------
    // Rasa REST channel endpoint. Use HTTPS in production.
    rasaServerUrl: "http://localhost:5005/webhooks/rest/webhook",
    // Rasa action server endpoint, only needed when `startConversation` is true.
    actionServerUrl: "http://localhost:5055/webhook/",
    // Custom action to run so the bot speaks first (Rasa 2.x+ action server).
    startActionName: "action_hello_world",
    // When true the widget triggers `startActionName` on load so the bot greets first.
    startConversation: false,
    // Abort a request to the bot after this many milliseconds and show the fallback message.
    requestTimeoutMs: 30000,

    // --- Branding ----------------------------------------------------------
    botName: "Sara",
    // Image shown on the floating launcher button.
    launcherAvatar: "./static/img/botAvatar.png",
    // Image shown next to each bot message and the typing indicator.
    botAvatar: "./static/img/sara_avatar.png",
    // Image shown next to each user message.
    userAvatar: "./static/img/userAvatar.jpg",

    // --- Greeting pop-up ---------------------------------------------------
    showGreetingPopup: true,
    greetingPopupDurationMs: 4000,
    greetingTitle: "Hey there 👋",
    greetingText:
      "I can help you get started with Rasa and answer your technical questions.",

    // --- UI text (override for localisation) --------------------------------
    messages: {
      inputPlaceholder: "Type a message...",
      fallback: "I am facing some issues, please try again later!!!",
      dropdownPlaceholder: "Choose your option",
      menuClear: "Clear",
      menuRestart: "Restart",
      menuClose: "Close",
      chartExpand: "Expand chart",
      send: "Send message",
      openChat: "Open chat",
      menu: "Chat menu",
    },

    // --- Behaviour ---------------------------------------------------------
    // Fade-in duration for new messages in milliseconds. 0 disables animation.
    messageFadeMs: 300,
    // Log widget activity and bot responses to the browser console.
    debug: false,
    // Optional callback invoked with (error, context) when a request to the bot fails.
    onError: null,
  };

  const overrides = global.CHATBOT_CONFIG || {};
  const merged = Object.assign({}, defaults, overrides);
  merged.messages = Object.assign({}, defaults.messages, overrides.messages || {});
  global.CHATBOT_CONFIG = merged;
})(window);
