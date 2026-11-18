/**
 * Renders a dropdown message and sends the chosen value to Rasa.
 * @param {Array} dropDownData json array of `{ label, value }`
 */
function renderDropDwon(dropDownData) {
  const select = el("select", { class: "browser-default dropDownSelect", "aria-label": getConfig().messages.dropdownPlaceholder });
  select.appendChild(
    el("option", { value: "", disabled: true, selected: true, text: getConfig().messages.dropdownPlaceholder })
  );
  dropDownData.forEach((option) => {
    if (!option) return;
    select.appendChild(el("option", { value: textOf(option.value), text: textOf(option.label) }));
  });
  const wrapper = el("div", { class: "dropDownMsg" }, select);
  chatLog().appendChild(wrapper);
  scrollToBottomOfResults();

  select.addEventListener("change", () => {
    const chosen = select.selectedOptions[0];
    if (!chosen) return;
    setUserResponse(chosen.textContent);
    send(select.value);
    wrapper.remove();
  });
}
