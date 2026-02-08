/**
 * WAV Encoder/Decoder unit tests
 */

import { describe, expect, it } from 'vitest';
import {
  pcmToWav,
  pcmToWavDataUrl,
  wavToPcm,
  wavDataUrlToPcm,
  int16ToBytes,
  bytesToInt16,
  uint8ArrayToBase64,
  base64ToUint8Array,
  extractBase64FromDataUrl,
} from '../wav-encoder.js';

describe('wav-encoder', () => {
  describe('pcmToWav', () => {
    it('prepends 44-byte WAV header to PCM data', () => {
      const pcm = new Uint8Array(100);
      const wav = pcmToWav(pcm);
      expect(wav.length).toBe(44 + 100);
      expect(wav[0]).toBe(0x52); // 'R'
      expect(wav[1]).toBe(0x49); // 'I'
      expect(wav[2]).toBe(0x46); // 'F'
      expect(wav[3]).toBe(0x46); // 'F'
    });

    it('copies PCM data after header', () => {
      const pcm = new Uint8Array([1, 2, 3, 4, 5]);
      const wav = pcmToWav(pcm);
      expect(wav[44]).toBe(1);
      expect(wav[45]).toBe(2);
      expect(wav[48]).toBe(5);
    });

    it('accepts custom sample rate and channels', () => {
      const pcm = new Uint8Array(10);
      const wav = pcmToWav(pcm, { sampleRate: 16000, numChannels: 2 });
      expect(wav.length).toBe(44 + 10);
    });
  });

  describe('pcmToWavDataUrl', () => {
    it('returns data URL with base64 WAV', () => {
      const pcm = new Uint8Array(10);
      const url = pcmToWavDataUrl(pcm);
      expect(url).toMatch(/^data:audio\/wav;base64,/);
      expect(url.length).toBeGreaterThan(44);
    });
  });

  describe('wavToPcm', () => {
    it('strips header and returns PCM + metadata', () => {
      const pcm = new Uint8Array([10, 20, 30]);
      const wav = pcmToWav(pcm);
      const result = wavToPcm(wav);
      expect(result.pcmData.length).toBe(3);
      expect(result.pcmData[0]).toBe(10);
      expect(result.metadata.sampleRate).toBe(24000);
      expect(result.metadata.numChannels).toBe(1);
    });

    it('throws on too-small buffer', () => {
      expect(() => wavToPcm(new Uint8Array(10))).toThrow('Invalid WAV');
    });

    it('throws on invalid RIFF header', () => {
      const bad = new Uint8Array(50);
      bad[0] = 0x00;
      expect(() => wavToPcm(bad)).toThrow('RIFF');
    });
  });

  describe('wavDataUrlToPcm', () => {
    it('decodes data URL to PCM', () => {
      const pcm = new Uint8Array([1, 2, 3]);
      const wav = pcmToWav(pcm);
      const url = pcmToWavDataUrl(pcm);
      const result = wavDataUrlToPcm(url);
      expect(result.pcmData.length).toBe(3);
      expect(result.pcmData[0]).toBe(1);
    });
  });

  describe('int16ToBytes / bytesToInt16', () => {
    it('round-trips Int16Array', () => {
      const samples = new Int16Array([100, -200, 0]);
      const bytes = int16ToBytes(samples);
      const back = bytesToInt16(bytes);
      expect(back.length).toBe(3);
      expect(back[0]).toBe(100);
      expect(back[1]).toBe(-200);
    });
  });

  describe('uint8ArrayToBase64 / base64ToUint8Array', () => {
    it('round-trips bytes', () => {
      const data = new Uint8Array([1, 2, 3, 255]);
      const b64 = uint8ArrayToBase64(data);
      expect(typeof b64).toBe('string');
      const back = base64ToUint8Array(b64);
      expect(back.length).toBe(4);
      expect(back[3]).toBe(255);
    });
  });

  describe('extractBase64FromDataUrl', () => {
    it('extracts base64 from data URL', () => {
      const url = 'data:audio/wav;base64,QUJD';
      expect(extractBase64FromDataUrl(url)).toBe('QUJD');
    });
    it('returns raw string when no data: prefix', () => {
      expect(extractBase64FromDataUrl('QUJD')).toBe('QUJD');
    });
  });
});
