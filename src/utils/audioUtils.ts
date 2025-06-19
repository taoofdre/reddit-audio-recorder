// src/utils/audioUtils.ts

export function encodeAudioBufferToWavBlob(audioBuffer: AudioBuffer): Blob {
  const numOfChan = audioBuffer.numberOfChannels;
  const length = audioBuffer.length * numOfChan * 2 + 44; // 2 bytes per sample, 44 bytes for header
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  const channels: Float32Array[] = [];
  let i, sample;
  let offset = 0;
  let pos = 0;

  // Helper function to write strings
  function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF chunk descriptor
  writeString(view, pos, 'RIFF'); pos += 4;
  view.setUint32(pos, length - 8, true); pos += 4; // file length - 8
  writeString(view, pos, 'WAVE'); pos += 4;

  // FMT sub-chunk
  writeString(view, pos, 'fmt '); pos += 4;
  view.setUint32(pos, 16, true); pos += 4; // subchunk1size (16 for PCM)
  view.setUint16(pos, 1, true); pos += 2; // audioFormat (1 for PCM)
  view.setUint16(pos, numOfChan, true); pos += 2; // numChannels
  view.setUint32(pos, audioBuffer.sampleRate, true); pos += 4; // sampleRate
  view.setUint32(pos, audioBuffer.sampleRate * 2 * numOfChan, true); pos += 4; // byteRate (sampleRate * blockAlign)
  view.setUint16(pos, numOfChan * 2, true); pos += 2; // blockAlign (numChannels * bytesPerSample)
  view.setUint16(pos, 16, true); pos += 2; // bitsPerSample (16 bits)

  // DATA sub-chunk
  writeString(view, pos, 'data'); pos += 4;
  view.setUint32(pos, length - pos - 4, true); pos += 4; // subchunk2size (data size)

  // Write PCM samples
  for (i = 0; i < numOfChan; i++) {
    channels.push(audioBuffer.getChannelData(i));
  }

  offset = pos;
  for (i = 0; i < audioBuffer.length; i++) {
    for (let chan = 0; chan < numOfChan; chan++) {
      sample = Math.max(-1, Math.min(1, channels[chan][i])); // Clamp
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); // Scale to 16-bit signed int
      view.setInt16(offset, sample, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: 'audio/wav' });
}
