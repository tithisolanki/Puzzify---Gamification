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

  const playClick = useCallback(() => {
    playTone(800, "sine", 0.05, 0.05);
  }, [playTone]);

  const playPowerup = useCallback((type: "shield" | "freeze" | "auto") => {
    if (type === "shield") {
      playTone(400, "sine", 0.3, 0.1);
      setTimeout(() => playTone(800, "sine", 0.4, 0.1), 100);
    } else if (type === "freeze") {
      playTone(1200, "square", 0.2, 0.05);
      setTimeout(() => playTone(1000, "square", 0.3, 0.05), 100);
      setTimeout(() => playTone(800, "square", 0.4, 0.05), 200);
    } else {
      playTone(600, "triangle", 0.1, 0.1);
      setTimeout(() => playTone(900, "triangle", 0.2, 0.1), 100);
      setTimeout(() => playTone(1200, "triangle", 0.3, 0.1), 200);
    }
  }, [playTone]);

  const playWin = useCallback(() => {
    playTone(523.25, "sine", 0.2, 0.1); // C5
    setTimeout(() => playTone(659.25, "sine", 0.2, 0.1), 200); // E5
    setTimeout(() => playTone(783.99, "sine", 0.2, 0.1), 400); // G5
    setTimeout(() => playTone(1046.50, "sine", 0.6, 0.2), 600); // C6
  }, [playTone]);

  const playLose = useCallback(() => {
    playTone(392.00, "sawtooth", 0.3, 0.1); // G4
    setTimeout(() => playTone(349.23, "sawtooth", 0.3, 0.1), 300); // F4
    setTimeout(() => playTone(311.13, "sawtooth", 0.4, 0.1), 600); // Eb4
    setTimeout(() => playTone(261.63, "sawtooth", 0.8, 0.2), 900); // C4
  }, [playTone]);

  return { playSwap, playMatch, playError, playInterference, playClick, playPowerup, playWin, playLose };
}
