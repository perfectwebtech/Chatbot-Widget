/**
 * Widget bootstrap: applies the configuration to the markup and wires the
 * launcher, header menu and greeting pop-up.
 */

/** Copy configurable text and images into the static markup. */
function applyConfigToMarkup() {
  const config = getConfig();
  const { messages } = config;

  $(".chat_header_title").text(config.botName);
  $(".imgProfile").attr("src", config.launcherAvatar).attr("alt", config.botName);
  $("#profile_div").attr("aria-label", messages.openChat);
  $(".tap-target-content h5").text(config.greetingTitle);
  $(".tap-target-content p").text(config.greetingText);
  $("#userInput").attr("placeholder", messages.inputPlaceholder);
  $("#sendButton").attr("aria-label", messages.send);
  $(".dropdown-trigger").attr("aria-label", messages.menu);
  $("#clear").text(messages.menuClear);
  $("#restart").text(messages.menuRestart);
  $("#close").text(messages.menuClose);
}

/** Show the Materialize tap-target greeting for a few seconds. */
function showGreetingPopup() {
  const config = getConfig();
  const target = document.querySelector(".tap-target");
  if (!target) return;
  // eslint-disable-next-line no-undef
  const instance = M.TapTarget.init(target, {});
  instance.open();
  setTimeout(() => instance.close(), config.greetingPopupDurationMs);
}

function toggleWidget() {
  $(".profile_div").toggle();
  $(".widget").toggle();
  const open = $(".widget").is(":visible");
  $("#profile_div").attr("aria-expanded", open ? "true" : "false");
  if (open) {
    $(".usrInput").focus();
    scrollToBottomOfResults();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const config = getConfig();
  applyConfigToMarkup();

  if (config.showGreetingPopup) {
    showGreetingPopup();
  } else {
    $(".tap-target").remove();
  }
  $("div").removeClass("tap-target-origin");

  // header menu for clear, restart & close
  $(".dropdown-trigger").dropdown();
  // modal that renders expanded charts
  $(".modal").modal();

  if (config.startConversation) {
    $("#userInput").prop("disabled", true);
    customActionTrigger();
  }

  $("#profile_div").on("click keydown", (e) => {
    if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    toggleWidget();
  });

  $("#clear").on("click", (e) => {
    e.preventDefault();
    $(".chats").fadeOut("normal", () => {
      destroyCharts();
      $(".chats").html("");
      $(".chats").fadeIn();
    });
  });

  $("#close").on("click", (e) => {
    e.preventDefault();
    toggleWidget();
  });
});
