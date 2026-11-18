/**
 * Builds the horizontally scrolling cards carousel element.
 * @param {Array} cardsData json array of `{ image, title }`
 * @returns {HTMLElement}
 */
function createCardsCarousel(cardsData) {
  const scroller = el("div", { class: "cards_scroller" });
  cardsData.forEach((card) => {
    if (!card) return;
    const children = [];
    if (isSafeUrl(card.image)) {
      children.push(el("img", { class: "cardBackgroundImage", src: card.image, alt: "" }));
    }
    children.push(
      el("div", { class: "cardFooter" }, [
        el("span", { class: "cardTitle", title: textOf(card.title), text: textOf(card.title) }),
        el("div", { class: "cardDescription" }),
      ])
    );
    scroller.appendChild(el("div", { class: "carousel_cards in-left" }, children));
  });
  const prev = el("span", { class: "arrow prev", role: "button", "aria-label": "Previous", tabindex: "0" }, svgIcon(ICONS.chevronLeft));
  const next = el("span", { class: "arrow next", role: "button", "aria-label": "Next", tabindex: "0" }, svgIcon(ICONS.chevronRight));
  scroller.appendChild(prev);
  scroller.appendChild(next);
  return el("div", { id: "paginated_cards", class: "cards" }, scroller);
}

/**
 * Appends the cards carousel to the chat screen.
 * @param {Array} cardsToAdd json array
 */
function showCardsCarousel(cardsToAdd) {
  const card = createCardsCarousel(cardsToAdd);
  chatLog().appendChild(card);
  $(card).show();

  const fade = getConfig().messageFadeMs;
  if (cardsToAdd.length <= 2) {
    $(card).find("div.carousel_cards:nth-of-type(2)").fadeIn(fade);
  } else {
    $(card).find("div.carousel_cards").fadeIn(fade);
    $(card).find(".arrow.prev, .arrow.next").fadeIn(fade);
  }
  scrollToBottomOfResults();

  const scroller = card.querySelector(".cards_scroller");
  const cardItemSize = 225;
  // scroll one item in the given direction and let css scroll snapping align it
  card.querySelector(".arrow.next").addEventListener("click", () => {
    scroller.scrollBy(cardItemSize, 0);
  });
  card.querySelector(".arrow.prev").addEventListener("click", () => {
    scroller.scrollBy(-cardItemSize, 0);
  });
  $(".usrInput").focus();
}
