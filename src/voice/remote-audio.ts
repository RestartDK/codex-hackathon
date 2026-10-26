/** Float samples retain quiet speech that a byte waveform rounds to silence. */
export function hasRemoteSpeech(samples: Float32Array): boolean {
  let energy = 0;
  for (const sample of samples) energy += sample * sample;
  return samples.length > 0 && energy / samples.length > 0.0001 ** 2;
}
