"use client";

import { useCallback, useRef } from "react";

export function useAudio(enabled: boolean) {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const getAudioContext = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume context if suspended (browser autoplay policy)
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const playTone = useCallback((freq: number, type: OscillatorType, duration: number, vol = 0.1) => {
    if (!enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    
    // Envelope to prevent clicking
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }, [enabled]);

  const playSwap = useCallback(() => {
    playTone(400, "sine", 0.1, 0.05);
    setTimeout(() => playTone(500, "sine", 0.1, 0.05), 50);
  }, [playTone]);

  const playMatch = useCallback(() => {
    playTone(523.25, "square", 0.1, 0.1); // C5
    setTimeout(() => playTone(659.25, "square", 0.2, 0.1), 100); // E5
    setTimeout(() => playTone(783.99, "square", 0.4, 0.1), 200); // G5
  }, [playTone]);

  const playError = useCallback(() => {
    playTone(150, "sawtooth", 0.2, 0.1);
  }, [playTone]);

  const playInterference = useCallback(() => {
    playTone(800, "sawtooth", 0.1, 0.1);
    setTimeout(() => playTone(400, "sawtooth", 0.2, 0.2), 100);
    setTimeout(() => playTone(200, "sawtooth", 0.3, 0.3), 300);
  }, [playTone]);

  return { playSwap, playMatch, playError, playInterference };
}
