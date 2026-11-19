/**
 * Td5 security access: 16-bit seed from the ECU -> 16-bit key.
 *
 * Confidence: community, with a known answer. Algorithm from pajacobson/td5keygen, derived
 * from disassembly of the ECU code: https://github.com/pajacobson/td5keygen
 * Its README gives seed 34A5 → key 54D3, which tests/td5.test.ts checks. Seed and key are
 * big-endian ([high][low]); an ESP32 project only authenticated after fixing exactly that.
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
