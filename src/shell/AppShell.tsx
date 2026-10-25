import { useCallback, useEffect, useState } from "react";
import PlayByVoiceApp from "../app/App";
import { useSettings } from "../hooks/useSettings";
import WerewolfApp from "../werewolf/App";
import LudoPage from "../components/LudoGame/LudoPage";
import InterceptPage from "../components/InterceptGame/InterceptPage";
import TicTacToePage from "../components/TicTacToeGame/TicTacToePage";
import "../styles/library-games.css";

const EXPERIENCES = {
  "play-by-voice": { title: "Play by Voice", themeColor: "#ffffff" },
  "loups-garous": { title: "Loups-Garous â€” A Village Game", themeColor: "#ffffff" },
  ludo: { title: "Voice Ludo", themeColor: "#101827" },
  intercept: { title: "The Intercept", themeColor: "#101c21" },
  "tic-tac-toe": { title: "Voice Tic-Tac-Toe", themeColor: "#0b1724" },
} as const;

type Experience = keyof typeof EXPERIENCES;

export default function AppShell() {
  const preferences = useSettings();
  const [experience, setExperience] = useState<Experience>("play-by-voice");
  const playLoupsGarous = useCallback(() => setExperience("loups-garous"), []);
  const playLudo = useCallback(() => setExperience("ludo"), []);
  const playIntercept = useCallback(() => setExperience("intercept"), []);
  const playTicTacToe = useCallback(() => setExperience("tic-tac-toe"), []);
  const showGamePicker = useCallback(() => setExperience("play-by-voice"), []);
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
      />
    );

  if (experience === "ludo") return <LudoPage onExit={showGamePicker} preferences={preferences} />;
  if (experience === "intercept")
    return <InterceptPage onExit={showGamePicker} preferences={preferences} />;
  if (experience === "tic-tac-toe")
    return <TicTacToePage onExit={showGamePicker} preferences={preferences} />;

  return (
    <div className="pbv-root">
      <PlayByVoiceApp
        preferences={preferences}
        onPlayLoupsGarous={playLoupsGarous}
        onPlayLudo={playLudo}
        onPlayIntercept={playIntercept}
        onPlayTicTacToe={playTicTacToe}
      />
    </div>
  );
}

