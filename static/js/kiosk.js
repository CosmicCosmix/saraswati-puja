(() => {
  const content = document.getElementById("content");
  const label = document.getElementById("state-label");
  const nameEntryScreen = document.getElementById("name-entry-screen");
  const messageCard = document.getElementById("message-card");
  const audioTitle = document.getElementById("audio-title");
  const audioDescription = document.getElementById("audio-description");
  const micOrb = document.getElementById("mic-orb");
  const micCaption = document.getElementById("mic-caption");
  const micButton = document.getElementById("mic-button");
  const nameForm = document.getElementById("name-form");
  const coach = document.getElementById("coach");
  const confidenceFill = document.querySelector(".confidence-fill");
  const blessingScreen = document.getElementById("blessing-screen");
  const blessingArt = document.getElementById("blessing-art");
  const blessingTitle = document.getElementById("blessing-title");
  const blessingQuote = document.getElementById("blessing-quote");
  const blessingRecipient = document.getElementById("blessing-recipient");
  let previousState = "";
  let previousView = "";
  let soundEnabled = true;
  const prayerAudio = new Audio("/static/sounds/sarasvati%20pooja%20mix.mp3");
  prayerAudio.loop = true;
  prayerAudio.preload = "none";
  const prayerAudioButton = document.getElementById("prayer-audio-enable");
  let prayerSessionActive = false;
  let prayerPlaybackAttempted = false;
  const audioContext = window.AudioContext ? new AudioContext() : null;
  let currentSnapshot = null;
  let speechRecognition = null;
  let speechRecognitionActive = false;
  let speechRecognitionRequested = false;
  let namePostPending = false;
  let micStatusText = "";
  let micErrorText = "";
  let microphonePermissionGranted = false;
  let interimNameTimer = null;
  let interimNameText = "";

  function updateMicStatus(message, isError = false) {
    micStatusText = isError ? "" : message;
    micErrorText = isError ? message : "";
    const status = document.getElementById("voice-status") || audioDescription;
    const button = document.getElementById("mic-start") || micButton;
    if (status) {
      status.textContent = message;
      status.setAttribute("role", isError ? "alert" : "status");
    }
    if (button && !speechRecognitionActive) button.disabled = false;
  }

  function stopSpeechRecognition() {
    speechRecognitionRequested = false;
    namePostPending = false;
    window.clearTimeout(interimNameTimer);
    interimNameTimer = null;
    interimNameText = "";
    if (speechRecognitionActive && speechRecognition) speechRecognition.stop();
    speechRecognitionActive = false;
  }

  async function submitRecognizedName(transcript) {
    if (namePostPending || currentSnapshot?.state !== "NAME" || currentSnapshot.payload?.name) return;
    namePostPending = true;
    updateMicStatus(`I heard “${transcript}”. Checking your name…`);
    try {
      const response = await fetch("/api/name", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({name: transcript})
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Could not use that name. Please say it again.");
      stopSpeechRecognition();
      updateMicStatus(`I heard ${result.name}. Show 1 finger to confirm, or 2 fingers to say it again.`);
    } catch (error) {
      namePostPending = false;
      updateMicStatus(error.message || "Could not submit the recognized name. Please try again.", true);
    }
  }

  async function startSpeechRecognition() {
    if (speechRecognitionRequested) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      updateMicStatus("Speech recognition is not supported in this browser. Please use the latest Chrome or Edge.", true);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      updateMicStatus("This page cannot access a microphone. Open the kiosk on localhost or a secure HTTPS connection.", true);
      return;
    }
    speechRecognitionRequested = true;
    updateMicStatus("Requesting microphone permission…");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      stream.getTracks().forEach(track => track.stop());
      microphonePermissionGranted = true;
    } catch (error) {
      speechRecognitionRequested = false;
      const messages = {
        NotAllowedError: "Microphone access is blocked. Allow microphone access for this site in your browser settings, then try again.",
        NotFoundError: "No microphone was found. Connect or enable a microphone, then try again.",
        NotReadableError: "The microphone is busy in another app. Close that app and try again."
      };
      updateMicStatus(messages[error.name] || `Could not access the microphone: ${error.message || error.name}`, true);
      return;
    }
    const recognition = new Recognition();
    speechRecognition = recognition;
    recognition.lang = "en-IN";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => {
      speechRecognitionActive = true;
      micOrb.classList.add("listening");
      micCaption.textContent = "Listening";
      updateMicStatus("Microphone on. Speak your name clearly.");
      const button = document.getElementById("mic-start") || micButton;
      const buttonLabel = document.getElementById("mic-button-label");
      if (button) {
        button.disabled = true;
        if (buttonLabel) buttonLabel.textContent = "Microphone on — say your name";
        else button.textContent = "Microphone on — say your name";
      }
    };
    recognition.onresult = event => {
      let finalTranscript = "";
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal && result[0]?.transcript.trim()) {
          finalTranscript = result[0].transcript.trim();
        } else if (result[0]?.transcript.trim()) {
          interimTranscript = result[0].transcript.trim();
        }
      }
      if (finalTranscript) {
        window.clearTimeout(interimNameTimer);
        interimNameTimer = null;
        interimNameText = "";
        submitRecognizedName(finalTranscript);
      } else if (interimTranscript) {
        interimNameText = interimTranscript;
        updateMicStatus(`Listening: ${interimTranscript}`);
        window.clearTimeout(interimNameTimer);
        interimNameTimer = window.setTimeout(() => {
          if (interimNameText && currentSnapshot?.state === "NAME" && !currentSnapshot.payload?.name) {
            submitRecognizedName(interimNameText);
          }
        }, 700);
      }
    };
    recognition.onerror = event => {
      const messages = {
        "not-allowed": "Microphone permission is blocked. Allow it for this site, then try again.",
        "service-not-allowed": "The browser speech service is blocked. Check browser settings or try Chrome/Edge.",
        "audio-capture": "No working microphone was found. Check the microphone connection and Windows input settings.",
        network: "The browser speech service could not be reached. Check the internet connection or type your name below.",
        "no-speech": "I didn't hear speech. Say your name clearly after the microphone is ready.",
        "language-not-supported": "The browser does not support English (India) speech recognition."
      };
      const message = messages[event.error] || `Speech recognition failed: ${event.error}.`;
      if (!["no-speech", "aborted"].includes(event.error)) speechRecognitionRequested = false;
      updateMicStatus(message, !["no-speech", "aborted"].includes(event.error));
    };
    recognition.onend = () => {
      speechRecognitionActive = false;
      micOrb.classList.remove("listening");
      micCaption.textContent = "Off";
      if (!speechRecognitionRequested || currentSnapshot?.state !== "NAME") {
        const button = document.getElementById("mic-start") || micButton;
        const buttonLabel = document.getElementById("mic-button-label");
        if (button) {
          button.disabled = false;
          if (buttonLabel) buttonLabel.textContent = "Enable microphone & say your name";
          else button.textContent = "Enable microphone & say your name";
        }
        return;
      }
      window.setTimeout(() => {
        if (!speechRecognitionRequested || currentSnapshot?.state !== "NAME") return;
        try {
          recognition.start();
        } catch (error) {
          speechRecognitionRequested = false;
          updateMicStatus(`Could not restart speech recognition: ${error.message}`, true);
        }
      }, 300);
    };
    try {
      recognition.start();
    } catch (error) {
      speechRecognitionRequested = false;
      updateMicStatus(`Could not start speech recognition: ${error.message}`, true);
    }
  }

  function tone(frequency = 660, duration = .16, volume = .07) {
    if (!audioContext) return;
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  }

  function stopPrayerMusic() {
    prayerAudio.pause();
    prayerAudio.currentTime = 0;
    prayerPlaybackAttempted = false;
    prayerAudioButton.hidden = true;
  }

  async function startPrayerMusic(force = false) {
    if (!prayerSessionActive || !soundEnabled || (!force && prayerPlaybackAttempted) || !prayerAudio.paused) return;
    prayerPlaybackAttempted = true;
    try {
      await prayerAudio.play();
      prayerAudioButton.hidden = true;
    } catch (error) {
      if (!prayerSessionActive || !soundEnabled) return;
      prayerAudioButton.textContent = error.name === "NotAllowedError"
        ? "Tap to enable devotional music"
        : "Try devotional music again";
      prayerAudioButton.hidden = false;
      if (error.name === "NotAllowedError") {
        console.info("Browser blocked devotional music autoplay; waiting for a user gesture.");
      } else {
        console.error("Could not play devotional music", error);
      }
    }
  }

  function syncPrayerMusic(mode) {
    const active = mode === "PRAYER" || mode === "BLESSING";
    if (!active) {
      if (prayerSessionActive) stopPrayerMusic();
      prayerSessionActive = false;
      return;
    }
    if (!prayerSessionActive) prayerPlaybackAttempted = false;
    prayerSessionActive = true;
    if (!soundEnabled) {
      stopPrayerMusic();
      return;
    }
    if (prayerAudio.paused) startPrayerMusic();
  }

  function playCue(name) {
    if (!soundEnabled) { stopPrayerMusic(); return; }
    if (name === "IDLE") { tone(523, .24, .035); return; }
    if (name === "PRAYER") return;
    if (name === "BLESSING") {
      tone(740, .35, .09);
      setTimeout(() => tone(988, .55, .07), 180);
    } else if (name === "QUESTION") tone(590, .2);
    else if (name === "FEEDBACK") tone(720, .25);
    else if (name === "NAME") tone(470, .22);
    else if (name === "RESULTS") tone(880, .4);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }

  function setContent(html) {
    content.innerHTML = html;
  }

  function renderAnswerCards(options, selected = null, correctIndex = null, showResult = false) {
    const letters = ["A", "B", "C", "D"];
    return options.map((option, index) => {
      const isSelected = index === selected;
      const isCorrect = showResult && index === correctIndex;
      const classes = ["answer-card", isSelected ? "selected" : "", isCorrect ? "correct" : ""].filter(Boolean).join(" ");
      const marker = isSelected || isCorrect ? '<span class="answer-check" aria-label="Selected">✓</span>' : "";
      return `<div class="${classes}">
        <div class="answer-card-heading">
          <span class="answer-letter">${letters[index]}</span>
          <span class="answer-copy">${escapeHtml(option)}</span>
          ${marker}
        </div>
        <span class="answer-hint"><span>Show “${letters[index]}”</span><span>${index + 1} ${index === 0 ? "finger" : "fingers"}</span></span>
      </div>`;
    }).join("");
  }

  function render(state) {
    const {state: mode, payload = {}, gesture = {}} = state;
    const previousSnapshot = currentSnapshot;
    currentSnapshot = state;
    const showBlessing = mode === "BLESSING";
    blessingScreen.hidden = !showBlessing;
    document.body.classList.toggle("blessing-active", showBlessing);
    if (mode !== "NAME") stopSpeechRecognition();
    else if (previousSnapshot?.state === "NAME" && previousSnapshot.payload?.name && !payload.name) {
      namePostPending = false;
      if (microphonePermissionGranted) window.setTimeout(startSpeechRecognition, 0);
    }
    else if (previousSnapshot && previousSnapshot.state !== "NAME" && microphonePermissionGranted) {
      window.setTimeout(startSpeechRecognition, 0);
    }
    soundEnabled = state.sound_enabled !== false;
    syncPrayerMusic(mode);
    if (mode !== previousState) {
      playCue(mode);
      if (mode === "BLESSING" && soundEnabled && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance("Thank you for celebrating with us."));
      }
      previousState = mode;
    }
    const progress = Math.max(0, Math.min(1, Number(gesture.progress) || 0));
    confidenceFill.style.width = `${Math.max(0, Math.min(1, Number(gesture.confidence) || 0)) * 100}%`;
    const fingerValue = gesture.value;
    if (mode === "IDLE") coach.textContent = "Say your name to begin";
    else if (gesture.awaiting_release) coach.textContent = mode === "NAME"
      ? payload.name
        ? "Lower your hand briefly, then show 1 finger to confirm or 2 to retry"
        : "Lower your hand briefly, then show it again"
      : mode === "READY"
      ? "Lower your hand briefly, then show 1 finger to start or 2 to decline"
      : "Lower your hand briefly, then show your answer again";
    else if (mode === "NAME") coach.textContent = payload.name
      ? "1 finger confirms your name; 2 fingers let you retry"
      : "Show one hand clearly inside the guide";
    else if (mode === "READY") coach.textContent = "1 finger to start the quiz; 2 fingers to decline";
    else if (mode === "QUESTION") coach.textContent = "Use 1–4 fingers to choose options A–D";
    else if (Number.isInteger(fingerValue)) coach.textContent = fingerValue === 5
      ? "5 fingers detected — hold steady"
      : `${fingerValue} finger${fingerValue === 1 ? "" : "s"} detected — hold steady`;
    else if (gesture.confidence > 0 && gesture.confidence < .75) coach.textContent = "Hold still";
    else if (fingerValue === null) coach.textContent = "Show one hand clearly";
    else if (progress > 0 && progress < 1) coach.textContent = "Hold still";
    else coach.textContent = "Move closer or show your hands clearly";

    const isNameScreen = mode === "NAME";
    nameEntryScreen.hidden = !isNameScreen;
    messageCard.hidden = isNameScreen;
    if (isNameScreen) {
      const hasName = Boolean(payload.name);
      audioTitle.textContent = payload.prompt || "Please say your name";
      audioDescription.textContent = hasName
        ? `I heard ${payload.name}. Show 1 finger to confirm, or 2 fingers to say your name again.`
        : micErrorText || micStatusText || "The microphone is off. Enable it to say your name.";
      micButton.hidden = hasName || window.KIOSK_SIMULATE;
      nameForm.hidden = hasName;
      document.getElementById("privacy-note").hidden = hasName;
      document.getElementById("name-divider").hidden = hasName;
      if (!speechRecognitionActive) document.getElementById("mic-button-label").textContent = "Enable microphone & say your name";
    }

    const stateLabels = {IDLE:"YOUR NAME", NAME:"YOUR NAME", READY:"READY TO PLAY", QUESTION:"QUESTION", FEEDBACK:"YOUR ANSWER", RESULTS:"YOUR SCORE", PRAYER:"A MOMENT OF PEACE", BLESSING:"A BLESSING FOR YOU"};
    label.textContent = stateLabels[mode] || mode;
    const signature = `${mode}:${JSON.stringify(payload)}`;
    if (signature === previousView) return;
    previousView = signature;
    if (mode === "NAME") return;
    if (mode === "IDLE") {
      setContent('<h2>Welcome, seeker of wisdom</h2><p>Say your name to begin your Navadurga quiz.</p><div class="gesture-help">🎙️ &nbsp; Speak your name</div>');
    } else if (mode === "READY") {
      setContent(`<h2>${escapeHtml(payload.prompt || "Ready to take the quiz?")}</h2><p class="gesture-help">Show 1 finger to start, or 2 fingers to decline.</p>`);
    } else if (mode === "QUESTION") {
      const seconds = Number(payload.seconds) || 20;
      const options = renderAnswerCards(payload.options || []);
      setContent(`<div class="question-view">
        <div class="question-topline"><span>QUESTION ${payload.number} OF ${payload.total}</span><span class="question-difficulty">${escapeHtml(payload.difficulty || "")}</span></div>
        <div class="question-timer countdown-ring" id="countdown-ring" data-duration="${seconds}" data-ends="${payload.ends_at || ""}" style="--timer-progress:100%"><span>${seconds}</span></div>
        <h2 class="question-title">${escapeHtml(payload.question)}</h2>
        <span class="question-accent" aria-hidden="true"></span>
        <div class="answer-grid">${options}</div>
        <p class="question-instruction">Use 1–4 fingers to choose an option</p>
      </div>`);
    } else if (mode === "FEEDBACK") {
      const showResult = payload.feedback_phase === "feedback";
      const options = renderAnswerCards(payload.options || [], payload.selected, payload.correct_index, showResult);
      if (payload.feedback_phase === "select") {
        setContent(`<div class="question-view">
          <div class="question-topline"><span>YOUR ANSWER</span><span class="question-difficulty">${escapeHtml(payload.difficulty || "")}</span></div>
          <h2 class="question-title">${escapeHtml(payload.question)}</h2>
          <span class="question-accent" aria-hidden="true"></span>
          <div class="answer-grid">${options}</div>
        </div>`);
      } else {
        setContent(`<div class="question-view">
          <div class="question-topline"><span>${payload.correct ? "CORRECT ANSWER" : "ANSWER REVIEW"}</span><span class="question-difficulty">${escapeHtml(payload.difficulty || "")}</span></div>
          <h2 class="question-title">${escapeHtml(payload.question)}</h2>
          <span class="question-accent" aria-hidden="true"></span>
          <div class="answer-grid">${options}</div>
          <p class="answer-result">${escapeHtml(payload.message || "Not quite")} · ${payload.correct ? `+${Number(payload.points) || 0} points` : "The correct answer is highlighted."}</p>
          <p class="feedback-reason">${escapeHtml(payload.reason || "")}</p>
        </div>`);
      }
    } else if (mode === "RESULTS") {
      setContent(`<h2>Well done, ${escapeHtml(payload.name)}!</h2><p class="result-score">${Number(payload.score) || 0} points</p><p>${escapeHtml(payload.prompt || "")}</p><p>Your score is now on the community leaderboard.</p>`);
    } else if (mode === "PRAYER") {
      setContent(`<div class="prayer-hands">🙏</div><h2>Take a moment</h2><p>${escapeHtml(payload.prompt || "Join your hands in prayer to receive a blessing.")}</p>`);
    } else if (mode === "BLESSING") {
      blessingArt.src = payload.image;
      blessingArt.alt = `Illustration of Goddess ${payload.goddess}`;
      blessingTitle.textContent = payload.goddess || "A blessing for you";
      blessingQuote.textContent = payload.slogan || "";
      blessingRecipient.textContent = payload.prompt || "";
    }
  }

  function connect() {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.onmessage = event => {
      try { render(JSON.parse(event.data)); } catch (error) { console.error("Could not render kiosk state", error); }
    };
    socket.onclose = () => setTimeout(connect, 1000);
  }
  connect();
  prayerAudioButton.addEventListener("click", () => startPrayerMusic(true));
  prayerAudio.addEventListener("error", () => {
    if (!prayerSessionActive || !soundEnabled) return;
    prayerAudioButton.textContent = "Try devotional music again";
    prayerAudioButton.hidden = false;
    console.error("Could not load devotional music", prayerAudio.error);
  });
  prayerAudio.addEventListener("playing", () => { prayerAudioButton.hidden = true; });
  const cameraStatus = document.getElementById("camera-status");
  async function refreshCameraStatus() {
    try {
      const response = await fetch("/api/camera/status");
      if (!response.ok) throw new Error(`Camera status request failed (${response.status})`);
      const result = await response.json();
      cameraStatus.textContent = result.status;
      cameraStatus.classList.toggle("camera-error", /unavailable|failed|not found|disconnected|black|dark/i.test(result.status));
    } catch (error) {
      cameraStatus.textContent = "Camera status unavailable";
      cameraStatus.classList.add("camera-error");
      console.error("Could not read camera status", error);
    }
  }
  refreshCameraStatus();
  setInterval(refreshCameraStatus, 2000);
  setInterval(() => {
    const countdown = document.getElementById("countdown-ring");
    if (!countdown) return;
    const secondsLeft = Math.max(0, Number(countdown.dataset.ends) - Date.now() / 1000);
    countdown.style.setProperty("--timer-progress", `${secondsLeft / Number(countdown.dataset.duration) * 100}%`);
    countdown.firstElementChild.textContent = String(Math.ceil(secondsLeft));
  }, 100);

  async function action(value) {
    const url = window.KIOSK_SIMULATE ? "/api/dev/action" : "/api/volunteer/action";
    try {
      const response = await fetch(url, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:value})});
      if (!response.ok) console.warn("Volunteer hotkey was not accepted", response.status);
    } catch (error) { console.error("Volunteer action failed", error); }
  }
  document.addEventListener("click", async event => {
    const button = event.target.closest("#mic-button, #mic-start");
    if (!button) return;
    button.disabled = true;
    await startSpeechRecognition();
    if (!speechRecognitionActive) button.disabled = false;
  });
  nameForm.addEventListener("submit", event => {
    event.preventDefault();
    const name = document.getElementById("name-input").value.trim();
    if (name) submitRecognizedName(name);
  });
  document.addEventListener("keydown", event => {
    if (audioContext && audioContext.state === "suspended") audioContext.resume();
    if (event.target && ["INPUT","TEXTAREA"].includes(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (key === "escape") { event.preventDefault(); action("reset"); }
    else if (["1","2","3","4"].includes(key)) action(key);
    else if (key === "p") action("namaste");
    else if (key === "n") action("skip");
  });
})();
