/**
 * Remove the bot typing indicator from the chat screen.
 */
function hideBotTyping() {
  $("#botAvatar").remove();
  $(".botTyping").remove();
}

/**
 * Show the bot typing indicator. It stays until the bot responds.
 */
function showBotTyping() {
  hideBotTyping();
  const avatar = el("img", {
    class: "botAvatar",
    id: "botAvatar",
    src: getConfig().botAvatar,
    alt: "",
  });
  const typing = el("div", { class: "botTyping", "aria-label": "Bot is typing" }, [
    el("div", { class: "bounce1" }),
    el("div", { class: "bounce2" }),
    el("div", { class: "bounce3" }),
  ]);
  chatLog().appendChild(avatar);
  chatLog().appendChild(typing);
  scrollToBottomOfResults();
}
