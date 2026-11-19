/**
 * Td5 security access: 16-bit seed from the ECU -> 16-bit key.
 *
 * Confidence: community. LFSR-style algorithm as published by the Td5 community
 * (open "td5keygen" implementations). The simulator uses this same function, so
 * passing tests prove nothing about correctness. Verify with a seed/key pair
 * captured from a real ECU (e.g. sniffing a Nanocom session), then add it to
 * tests/profiles.test.ts as a known-answer test.
 *
 * Symptom when wrong: SendKey answered with NRC 0x35 (invalid key).
 * After 3 bad keys the ECU locks out for about 10 s.
 */
export function td5Key(seed: number): number {
  let s = seed & 0xffff;
  const count = ((s >> 0xc) & 0x8) + ((s >> 0x5) & 0x4) + ((s >> 0x3) & 0x2) + (s & 0x1) + 1;

  for (let i = 0; i < count; i++) {
    const tap = ((s >> 1) + (s >> 2) + (s >> 8) + (s >> 9)) & 1;
    const tmp = ((s >> 1) | (tap << 0xf)) & 0xffff;
    if ((s >> 0x3) & 1 && (s >> 0xd) & 1) s = tmp & ~1 & 0xffff;
    else s = tmp | 1;
  }
  return s;
}
