import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import PlayByVoiceApp from "../app/App";
import { useSettings } from "../hooks/useSettings";
import WerewolfApp from "../werewolf/App";
import "../styles/library-games.css";
import { LibraryVoiceContext } from "../voice/useLibraryVoice";
import type { AvailableDestination } from "../voice/navigation";

const EXPERIENCES = {
  "play-by-voice": { title: "Play by Voice", themeColor: "#ffffff" },
  "loups-garous": { title: "Loups-Garous — A Village Game", themeColor: "#ffffff" },
  ludo: { title: "Voice Ludo", themeColor: "#101827" },
  intercept: { title: "The Intercept", themeColor: "#101c21" },
  "tic-tac-toe": { title: "Voice Tic-Tac-Toe", themeColor: "#0b1724" },
} as const;

type Experience = keyof typeof EXPERIENCES;
const LudoPage = lazy(() => import("../components/LudoGame/LudoPage"));
const InterceptPage = lazy(() => import("../components/InterceptGame/InterceptPage"));
const TicTacToePage = lazy(() => import("../components/TicTacToeGame/TicTacToePage"));

export default function AppShell() {
  const preferences = useSettings();
  const [experience, setExperience] = useState<Experience>("play-by-voice");
  const [initialDestination, setInitialDestination] = useState<AvailableDestination>("home");
  const [autoVoice, setAutoVoice] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("voice") === "1";
  });
  useEffect(() => {
    // The landing handoff is consumed once, so it never becomes a standing microphone opt-in.
    const url = new URL(window.location.href);
    if (url.searchParams.get("voice") !== "1") return;
    url.searchParams.delete("voice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const navigateLibrary = useCallback((destination: AvailableDestination, startVoice = false) => {
    setAutoVoice(startVoice);
    if (
      destination === "home" ||
      destination === "chess" ||
      destination === "audio" ||
      destination === "help"
    ) {
      setInitialDestination(destination);
      setExperience("play-by-voice");
    } else setExperience(destination);
  }, []);
  const playLoupsGarous = useCallback(() => setExperience("loups-garous"), []);
  const playLudo = useCallback((voice = false) => {
    setAutoVoice(voice);
    setExperience("ludo");
  }, []);
  const playIntercept = useCallback((voice = false) => {
    setAutoVoice(voice);
    setExperience("intercept");
  }, []);
  const playTicTacToe = useCallback((voice = false) => {
    setAutoVoice(voice);
    setExperience("tic-tac-toe");
  }, []);
  const showGamePicker = useCallback(() => {
    setAutoVoice(false);
    setInitialDestination("home");
    setExperience("play-by-voice");
  }, []);
  const setVoiceVolume = preferences.setVoiceVolume;
  const changeNarrationVolume = useCallback(
    (volume: number) => setVoiceVolume(Math.round(volume * 100)),
    [setVoiceVolume],
  );

  useEffect(() => {
    document.title = EXPERIENCES[experience].title;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", EXPERIENCES[experience].themeColor);
  }, [experience]);

  if (experience === "loups-garous")
    return (
      <WerewolfApp
        narrationVolume={preferences.settings.voiceVolume / 100}
        onNarrationVolumeChange={changeNarrationVolume}
        onShowGamePicker={showGamePicker}
        onNavigateGame={navigateLibrary}
      />
    );

  const shared = { preferences, navigate: navigateLibrary, autoVoice };
  const loading = (
    <main role="status" aria-live="polite">
      Loading game…
    </main>
  );
  if (experience === "ludo")
    return (
      <LibraryVoiceContext.Provider value={shared}>
        <Suspense fallback={loading}>
          <LudoPage onExit={showGamePicker} preferences={preferences} />
        </Suspense>
      </LibraryVoiceContext.Provider>
    );
  if (experience === "intercept")
    return (
      <LibraryVoiceContext.Provider value={shared}>
        <Suspense fallback={loading}>
          <InterceptPage onExit={showGamePicker} preferences={preferences} />
        </Suspense>
      </LibraryVoiceContext.Provider>
    );
  if (experience === "tic-tac-toe")
    return (
      <LibraryVoiceContext.Provider value={shared}>
        <Suspense fallback={loading}>
          <TicTacToePage onExit={showGamePicker} preferences={preferences} />
        </Suspense>
      </LibraryVoiceContext.Provider>
    );

  return (
    <div className="pbv-root">
      <PlayByVoiceApp
        preferences={preferences}
        initialDestination={initialDestination}
        autoVoice={autoVoice}
        onPlayLoupsGarous={playLoupsGarous}
        onPlayLudo={playLudo}
        onPlayIntercept={playIntercept}
        onPlayTicTacToe={playTicTacToe}
      />
    </div>
  );
}
