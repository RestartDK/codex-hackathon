export function isEligibleSeerTarget(
  player: { id: string; name: string; alive: boolean },
  seerId: string,
  investigations: readonly { name: string }[],
) {
  return (
    player.alive &&
    player.id !== seerId &&
    !investigations.some((finding) => finding.name === player.name)
  );
}
