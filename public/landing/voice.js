const voiceToggle = document.querySelector("#voice-navigation-toggle");
const voiceCaptions = document.querySelector("#voice-navigation-captions");

if (voiceToggle && voiceCaptions) {
  const controls = window.landingControls;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const voiceState = { active: false, stop: null, mode: "idle", generation: 0 };

  function caption(text) {
    voiceCaptions.hidden = !text;
    voiceCaptions.textContent = text;
  }

  function setActive(active) {
    voiceState.active = active;
    voiceState.generation += 1;
    voiceToggle.setAttribute("aria-pressed", String(active));
    const label = active ? "Stop voice navigation" : "Start voice navigation";
    const faces = voiceToggle.querySelectorAll(".roll-face");
    for (const face of faces) face.textContent = label;
    if (!faces.length) voiceToggle.textContent = label;
    voiceToggle.setAttribute("aria-label", label);
    if (!active) {
      voiceState.mode = "idle";
      const stop = voiceState.stop;
      voiceState.stop = null;
      stop?.();
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
    const generation = voiceState.generation;
    let stopped = false;
    const current = () => voiceState.active && voiceState.generation === generation && !stopped;
    const stop = () => {
      stopped = true;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
    };
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      if (!current()) return;
      for (let index = event.resultIndex; index < event.results.length; index += 1)
        if (event.results[index].isFinal) handleCommand(event.results[index][0].transcript);
    };
    recognition.onerror = (event) => {
      if (!current() || event.error === "no-speech") return;
      if (event.error === "network") {
        stop();
        voiceState.stop = null;
        void startTranscription();
        return;
      }
      setActive(false);
      caption(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone permission was denied. Allow microphone access, then press Start voice navigation to retry."
          : "Speech recognition stopped (" + event.error + "). Press Start voice navigation to retry.",
      );
    };
    recognition.onend = () => {
      if (!current()) return;
      try {
        recognition.start();
      } catch {
        setActive(false);
        caption("Speech recognition stopped. Press Start voice navigation to retry.");
      }
    };
    voiceState.mode = "browser";
    voiceState.stop = stop;
    try {
      recognition.start();
      caption("Listening. Say start playing, games, how it works, FAQ, menu, or stop voice.");
    } catch {
      setActive(false);
      caption("Speech recognition could not start. Press Start voice navigation to retry.");
    }
  }

  async function waitForIce(peer, signal) {
    if (peer.iceGatheringState === "complete") return;
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        window.clearTimeout(timeout);
        peer.removeEventListener("icegatheringstatechange", changed);
        signal.removeEventListener("abort", aborted);
      };
      const changed = () => {
        if (peer.iceGatheringState !== "complete") return;
        cleanup();
        resolve();
      };
      const aborted = () => {
        cleanup();
        reject(new DOMException("Voice stopped", "AbortError"));
      };
      const timeout = window.setTimeout(() => {
        cleanup();
        reject(new Error("Voice connection timed out. Press Start voice navigation to retry."));
      }, 10_000);
      peer.addEventListener("icegatheringstatechange", changed);
      signal.addEventListener("abort", aborted, { once: true });
      if (signal.aborted) aborted();
    });
  }

  async function startTranscription() {
    if (!voiceState.active) return;
    caption("Browser speech recognition is unavailable. Connecting live transcription…");
    const generation = voiceState.generation;
    const controller = new AbortController();
    const session = { stream: null, peer: null, channel: null, pending: "", timer: null, closed: false, transport: null };
    const current = () => voiceState.active && voiceState.generation === generation && !session.closed;
    const close = () => {
      session.closed = true;
      window.clearTimeout(session.timer);
      session.pending = "";
      controller.abort();
      session.channel?.close();
      session.stream?.getTracks().forEach((track) => track.stop());
      session.peer?.close();
    };
    const fail = (message) => {
      if (!current()) return;
      setActive(false);
      caption(message);
    };
    voiceState.mode = "connecting";
    voiceState.stop = close;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!current()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      session.stream = stream;
      const peer = new RTCPeerConnection();
      session.peer = peer;
      const channel = peer.createDataChannel("oai-events");
      session.channel = channel;
      channel.onmessage = (event) => {
        if (!current()) return;
        let payload;
        try {
          payload = JSON.parse(String(event.data));
        } catch {
          return;
        }
        const text = payload.delta ?? payload.transcript;
        if (payload.type === "session.input_transcript.delta" && typeof text === "string") {
          session.transport = "live";
          session.pending += text;
          window.clearTimeout(session.timer);
          session.timer = window.setTimeout(() => {
            if (!current()) return;
            const command = session.pending.trim();
            session.pending = "";
            if (command) handleCommand(command);
          }, 650);
        }
        if (
          session.transport !== "live" &&
          payload.type === "conversation.item.input_audio_transcription.completed" &&
          typeof payload.transcript === "string"
        ) {
          session.transport = "compatibility";
          handleCommand(payload.transcript);
        }
        if (payload.type === "error")
          fail("The voice service reported an error. Press Start voice navigation to retry.");
      };
      channel.onerror = () => fail("The voice connection had an error. Press Start voice navigation to retry.");
      channel.onclose = () => fail("The voice connection ended. Press Start voice navigation to retry.");
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "closed")
          fail("The voice connection ended. Press Start voice navigation to retry.");
      };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      await peer.setLocalDescription(await peer.createOffer());
      if (!current()) return;
      await waitForIce(peer, controller.signal);
      if (!current()) return;
      const response = await fetch("/api/voice/session", {
        method: "POST",
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: peer.localDescription?.sdp, mode: "lobby" }),
      });
      const data = await response.json();
      if (!current()) return;
      if (!response.ok) throw new Error(data.error ?? "Voice could not connect.");
      if (typeof data.transport?.sdp !== "string") throw new Error("Voice returned no connection. Press Start voice navigation to retry.");
      await peer.setRemoteDescription({ type: "answer", sdp: data.transport.sdp });
      if (!current()) return;
      voiceState.mode = "transcription";
      caption("Listening. Say start playing, games, how it works, FAQ, menu, or stop voice.");
    } catch (cause) {
      if (!current()) return;
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
