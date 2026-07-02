/**
 * Convierte un Blob de audio grabado a WAV PCM 16 kHz mono (formato unificado
 * para Shazam y AudD).
 */
export async function blobToWav16kMono(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const decodeCtx = new AudioCtx();
  let decoded: AudioBuffer;
  try {
    decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await decodeCtx.close().catch(() => {});
  }

  const targetRate = 16000;
  const mono = mixToMono(decoded);
  const offline = new OfflineAudioContext(1, Math.ceil(mono.duration * targetRate), targetRate);
  const source = offline.createBufferSource();
  source.buffer = mono;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const pcm = rendered.getChannelData(0);
  const wavBytes = encodeWavPcm16(pcm, targetRate);
  return new Blob([wavBytes], { type: 'audio/wav' });
}

/** Promedia N canales float32 en uno solo (función pura, testeable). */
export function averageChannels(channelArrays: Float32Array[]): Float32Array {
  if (channelArrays.length === 0) return new Float32Array(0);
  const length = channelArrays[0].length;
  const out = new Float32Array(length);
  const n = channelArrays.length;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let c = 0; c < n; c++) sum += channelArrays[c][i];
    out[i] = sum / n;
  }
  return out;
}

/** Mezcla canales a mono si hace falta. */
export function mixToMono(buffer: AudioBuffer): AudioBuffer {
  if (buffer.numberOfChannels === 1) return buffer;

  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }
  const averaged = averageChannels(channels);

  const mono = new AudioBuffer({
    length: buffer.length,
    sampleRate: buffer.sampleRate,
    numberOfChannels: 1,
  });
  mono.getChannelData(0).set(averaged);
  return mono;
}

/** Codifica samples float32 (-1..1) a WAV PCM 16-bit LE. */
export function encodeWavPcm16(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
