import { describe, expect, it } from "vitest";
import { encodeWavToMp3 } from "../audio-encode";

/**
 * Build a tiny valid WAV header + ~0.1s of silence so ffmpeg has something
 * real to chew on. PCM signed 16-bit mono 24 kHz.
 */
function makeMinimalWav(durationSeconds = 0.1, sampleRate = 24000): Buffer {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const dataSize = numSamples * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24); // sample rate
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  // data is left zero (silence)
  return buf;
}

describe("encodeWavToMp3", () => {
  it("produces a non-empty MP3 buffer with the ID3/MPEG sync marker", async () => {
    const wav = makeMinimalWav(0.5);
    const mp3 = await encodeWavToMp3(wav);
    expect(mp3.length).toBeGreaterThan(0);
    // First 3 bytes are either "ID3" tag or 0xFF 0xFB (MPEG sync)
    const first3 = mp3.subarray(0, 3).toString("ascii");
    const isMpegSync = mp3[0] === 0xff && (mp3[1] & 0xe0) === 0xe0;
    expect(first3 === "ID3" || isMpegSync).toBe(true);
  });
});
