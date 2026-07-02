import { describe, it, expect } from 'vitest';
import { encodeWavPcm16, averageChannels } from '../src/audio/wav';

describe('encodeWavPcm16', () => {
  it('genera header RIFF/WAVE válido', () => {
    const samples = new Float32Array([0, 0.5, -0.5]);
    const buf = encodeWavPcm16(samples, 16000);
    const view = new DataView(buf);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(String.fromCharCode(view.getUint8(8), view.getUint8(9), view.getUint8(10), view.getUint8(11))).toBe('WAVE');
    expect(view.getUint32(24, true)).toBe(16000);
  });
});

describe('averageChannels', () => {
  it('promedia canales estéreo', () => {
    const left = new Float32Array([1, -1]);
    const right = new Float32Array([3, -3]);
    expect(Array.from(averageChannels([left, right]))).toEqual([2, -2]);
  });
});
