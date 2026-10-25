import { useCallback, useEffect, useState } from "react";
import PlayByVoiceApp from "../app/App";
import { useSettings } from "../hooks/useSettings";
import WerewolfApp from "../werewolf/App";

const EXPERIENCES = {
  "play-by-voice": { title: "Play by Voice", themeColor: "#ffffff" },
  "loups-garous": { title: "Loups-Garous — A Village Game", themeColor: "#111313" },
} as const;

type Experience = keyof typeof EXPERIENCES;

export default function AppShell() {
  const preferences = useSettings();
  const [experience, setExperience] = useState<Experience>("play-by-voice");
  const playLoupsGarous = useCallback(() => setExperience("loups-garous"), []);
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

  return (
    <div className="pbv-root">
      <PlayByVoiceApp preferences={preferences} onPlayLoupsGarous={playLoupsGarous} />
    </div>
  );
}
