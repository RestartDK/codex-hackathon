// Voice navigation is consent based: nothing listens until the player presses the control.
const voiceToggle = document.querySelector("#voice-navigation-toggle");
const voiceCaptions = document.querySelector("#voice-navigation-captions");

if (voiceToggle && voiceCaptions) {
  const controls = window.landingControls;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const voiceState = { active: false, stop: null, mode: "idle" };

  function caption(text) {
    voiceCaptions.hidden = !text;
    voiceCaptions.textContent = text;
  }

  function setActive(active) {
    voiceState.active = active;
    voiceToggle.setAttribute("aria-pressed", String(active));
    const label = active ? "Stop voice navigation" : "Start voice navigation";
    const faces = voiceToggle.querySelectorAll(".roll-face");
    for (const face of faces) face.textContent = label;
    if (!faces.length) voiceToggle.textContent = label;
    voiceToggle.setAttribute("aria-label", label);
    if (!active) {
      voiceState.mode = "idle";
      voiceState.stop?.();
      voiceState.stop = null;
    }
  }

  function normalize(value) {
    return String(value)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  }

  function scrollToId(id) {
    const target = document.getElementById(id);
    if (!target) return false;
    target.scrollIntoView({ behavior: reducedMotion.matches ? "auto" : "smooth", block: "start" });
    return true;
  }

  function sectionFor(text) {
    if (/\b(top|hero|beginning|home)\b/.test(text)) return "top";
    if (/\b(games|chess|tic tac toe|werewolf|loups garous)\b/.test(text)) return "games";
    if (/\b(how it works|how does it work|steps)\b/.test(text)) return "how-it-works";
    if (/\b(experience|showcase|preview)\b/.test(text)) return "experience";
    if (/\b(accessibility|accessible)\b/.test(text)) return "accessibility";
    if (/\b(voice demo|voice section|demo)\b/.test(text)) return "voice-demo";
    if (/\bfaq\b/.test(text)) return "faq";
    return null;
  }

  function faqItemFor(text) {
    const items = controls?.faqItems ?? [];
    const keywords = text
      .replace(/\b(open|show|close|collapse|expand|the|faq|question|about|please|and)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!keywords) return null;
    return (
      items.find((item) => {
        const summary = normalize(item.querySelector("summary")?.textContent ?? "");
        return keywords
          .split(" ")
          .filter(Boolean)
          .every((word) => summary.includes(word));
      }) ?? null
    );
  }

  function handOff() {
    caption("Opening the game library with your voice companion. Listening continues there.");
    setActive(false);
    window.location.href = "/dashboard/?voice=1";
  }

  function handleCommand(raw) {
    const text = normalize(raw);
    if (!text) return;
    if (/^(stop|stop listening|stop voice|stop voice navigation|end voice|that s all)$/.test(text)) {
      setActive(false);
      caption("Voice navigation stopped.");
      return;
    }
    if (/\b(help|what can i say|what can i do|commands)\b/.test(text)) {
      caption(
        "Say start playing, games, how it works, accessibility, FAQ, open the menu, close the menu, pause animations, resume animations, scroll down, back to top, or stop voice.",
      );
      return;
    }
    if (
      /\b(start playing|start the game|open the dashboard|go to the dashboard|play a game|take me to the games)\b/.test(
        text,
      )
    ) {
      handOff();
      return;
    }
    if (/\b(open|show)( the)? menu\b/.test(text) || /^menu$/.test(text)) {
      controls?.setMenu(true);
      caption("Menu opened.");
      return;
    }
    if (/\b(close|hide)( the)? menu\b/.test(text)) {
      controls?.closeMenu(true);
      caption("Menu closed.");
      return;
    }
    if (/\b(pause|stop)\b.*\b(animation|animations|motion|movement)\b/.test(text)) {
      if (controls && !controls.motionPaused()) controls.toggleMotion();
      caption("Animations paused.");
      return;
    }
    if (/\b(resume|restart|play|start)\b.*\b(animation|animations|motion|movement)\b/.test(text)) {
      if (controls && controls.motionPaused()) controls.toggleMotion();
      caption("Animations resumed.");
      return;
    }
    if (/\b(close|collapse)\b.*\bfaq\b/.test(text)) {
      for (const item of controls?.faqItems ?? [])
        if (item.dataset.expanded === "true") controls.setFaqExpanded(item, false);
      caption("FAQ answers closed.");
      return;
    }
    if (/\bfaq\b/.test(text)) {
      const item = faqItemFor(text);
      scrollToId("faq");
      if (item) {
        controls?.setFaqExpanded(item, true);
        caption(`FAQ opened: ${item.querySelector("summary")?.textContent?.trim() ?? ""}`);
      } else caption("Showing frequently asked questions.");
      return;
    }
    if (/\b(scroll|jump|go)\b.*\bdown\b/.test(text)) {
      window.scrollBy({ top: window.innerHeight * 0.8, behavior: reducedMotion.matches ? "auto" : "smooth" });
      caption("Scrolled down.");
      return;
    }
    if (/\b(scroll|go)\b.*\bup\b/.test(text)) {
      window.scrollBy({ top: -window.innerHeight * 0.8, behavior: reducedMotion.matches ? "auto" : "smooth" });
      caption("Scrolled up.");
      return;
    }
    if (/\b(back to top|top of the page|beginning)\b/.test(text)) {
      scrollToId("top");
      caption("Back at the top.");
      return;
    }
    const section = sectionFor(text);
    if (section && scrollToId(section)) {
      caption(`Showing ${section.replace(/-/g, " ")}.`);
      return;
    }
    caption("I did not match that. Say help to hear the landing page commands.");
  }

  function startBrowserRecognition() {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      void startTranscription();
      return;
    }
    let recognition;
    try {
      recognition = new Recognition();
    } catch {
      void startTranscription();
      return;
    }
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1)
        if (event.results[index].isFinal) handleCommand(event.results[index][0].transcript);
    };
    recognition.onerror = (event) => {
      if (event.error === "network") {
        voiceState.stop?.();
        voiceState.stop = null;
        void startTranscription();
      }
    };
    recognition.onend = () => {
      if (voiceState.active && voiceState.mode === "browser") {
        try {
          recognition.start();
        } catch {
          /* A restart can be refused while the engine is closing; onend runs again. */
        }
      }
    };
    voiceState.mode = "browser";
    voiceState.stop = () => {
      try {
        recognition.stop();
      } catch {
        /* The recognizer may already be stopped. */
      }
    };
    recognition.start();
    caption("Listening. Say start playing, games, how it works, FAQ, menu, or stop voice.");
  }

  function flushTranscript(session, text, immediate) {
    session.pending += text;
    window.clearTimeout(session.timer);
    const send = () => {
      const command = session.pending.trim();
      session.pending = "";
      if (command) handleCommand(command);
    };
    if (immediate) send();
    else session.timer = window.setTimeout(send, 650);
  }

  async function startTranscription() {
    caption("Browser speech recognition is unavailable. Connecting the live transcription companion…");
    const session = { pending: "", timer: undefined, close: undefined };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const peer = new RTCPeerConnection();
      const channel = peer.createDataChannel("oai-events");
      channel.onmessage = (event) => {
        let payload;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const text = payload.delta ?? payload.transcript;
        if (payload.type === "session.input_transcript.delta" && text)
          flushTranscript(session, text, false);
        if (
          payload.type === "conversation.item.input_audio_transcription.completed" &&
          typeof payload.transcript === "string"
        )
          flushTranscript(session, payload.transcript, true);
      };
      channel.onerror = () => caption("The voice connection had an error. Press Start voice navigation to retry.");
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" && voiceState.active) {
          setActive(false);
          caption("The voice connection ended. Press Start voice navigation to retry.");
        }
      };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      await peer.setLocalDescription(await peer.createOffer());
      const response = await fetch("/api/voice/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, mode: "lobby" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Voice could not connect.");
      await peer.setRemoteDescription({
        type: "answer",
        sdp: data.transport?.sdp ?? data.sdp,
      });
      session.close = () => {
        channel.close();
        stream.getTracks().forEach((track) => track.stop());
        peer.close();
      };
      voiceState.mode = "transcription";
      voiceState.stop = () => {
        session.close?.();
        window.clearTimeout(session.timer);
      };
      caption("Listening. Say start playing, games, how it works, FAQ, menu, or stop voice.");
    } catch (cause) {
      session.close?.();
      setActive(false);
      caption(cause instanceof Error ? cause.message : "Voice navigation could not start.");
    }
  }

  voiceToggle.addEventListener("click", () => {
    if (voiceState.active) {
      setActive(false);
      caption("Voice navigation stopped.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      caption("This browser has no microphone support, so voice navigation is unavailable.");
      return;
    }
    setActive(true);
    startBrowserRecognition();
  });
  window.addEventListener("pagehide", () => setActive(false));
}
