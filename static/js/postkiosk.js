(() => {
  const prayerView = document.getElementById("prayer-view");
  const prayerPrompt = document.getElementById("prayer-prompt");
  const prayerName = document.getElementById("prayer-name");
  const countdown = document.getElementById("prayer-countdown");
  const blessingScreen = document.getElementById("blessing-screen");
  const blessingArt = document.getElementById("blessing-art");
  const blessingTitle = document.getElementById("blessing-title");
  const blessingQuote = document.getElementById("blessing-quote");
  const blessingRecipient = document.getElementById("blessing-recipient");
  const blessingMusic = document.getElementById("blessing-music");
  const connectionStatus = document.getElementById("connection-status");
  let previousState = "";
  let soundEnabled = true;

  function playMusic() {
    blessingMusic.play().catch(error => console.warn("Could not play blessing music.", error));
  }

  function stopMusic() {
    blessingMusic.pause();
    blessingMusic.currentTime = 0;
  }

  function render(snapshot) {
    const {state, payload = {}} = snapshot;
    if (state === "NAME") {
      location.replace("/kiosk");
      return;
    }
    if (!["PRAYER", "BLESSING"].includes(state)) {
      connectionStatus.textContent = "Preparing your prayer experience…";
      connectionStatus.hidden = false;
      return;
    }

    connectionStatus.hidden = true;
    prayerView.hidden = state !== "PRAYER";
    blessingScreen.hidden = state !== "BLESSING";
    const wasSoundEnabled = soundEnabled;
    soundEnabled = snapshot.sound_enabled !== false;

    if (state === "PRAYER") {
      prayerPrompt.textContent = payload.prompt || "Bring your hands together and take a quiet moment for prayer.";
      prayerName.textContent = payload.name || "";
      countdown.dataset.ends = payload.ends_at || "";
      countdown.dataset.duration = payload.seconds || 5;
    } else {
      blessingArt.src = payload.image;
      blessingArt.alt = `Illustration of Goddess ${payload.goddess}`;
      blessingTitle.textContent = payload.goddess || "A blessing for you";
      blessingQuote.textContent = payload.slogan || "";
      blessingRecipient.textContent = payload.prompt || "";
    }

    if (!soundEnabled) {
      stopMusic();
    } else if (state === "BLESSING" && (state !== previousState || !wasSoundEnabled)) {
      playMusic();
    } else if (state !== "BLESSING") {
      stopMusic();
    }
    previousState = state;
  }

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onopen = () => { connectionStatus.hidden = true; };
    socket.onmessage = event => {
      try {
        render(JSON.parse(event.data));
      } catch (error) {
        console.error("Could not render post-quiz screen", error);
      }
    };
    socket.onerror = () => { connectionStatus.textContent = "Reconnecting to the prayer experience…"; connectionStatus.hidden = false; };
    socket.onclose = () => {
      connectionStatus.textContent = "Reconnecting to the prayer experience…";
      connectionStatus.hidden = false;
      setTimeout(connect, 1000);
    };
  }

  connect();
  setInterval(() => {
    if (countdown.hidden || !countdown.dataset.ends) return;
    const remaining = Math.max(0, Number(countdown.dataset.ends) - Date.now() / 1000);
    countdown.firstElementChild.textContent = String(Math.ceil(remaining));
  }, 100);
})();
