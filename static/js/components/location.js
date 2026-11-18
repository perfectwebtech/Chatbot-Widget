/**
 * Sends the user's coordinates to Rasa as an `/inform` intent.
 * @param {GeolocationPosition} position
 */
function getUserPosition(position) {
  const latitude = Number(position.coords.latitude);
  const longitude = Number(position.coords.longitude);
  const response = `/inform${JSON.stringify({ latitude, longitude })}`;
  $("#userInput").prop("disabled", false);
  showBotTyping();
  send(response);
}

/**
 * Handles a geolocation error by telling the bot the user declined.
 * @param {GeolocationPositionError} error
 */
function handleLocationAccessError(error) {
  log("Geolocation error", error && error.code, error && error.message);
  const response = '/inform{"user_location":"deny"}';
  showBotTyping();
  send(response);
  $(".usrInput").val("");
  $("#userInput").prop("disabled", false);
}

/**
 * Asks the browser for the user's location.
 */
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(getUserPosition, handleLocationAccessError);
  } else {
    log("Geolocation is not supported by this browser.");
    handleLocationAccessError(null);
  }
}
