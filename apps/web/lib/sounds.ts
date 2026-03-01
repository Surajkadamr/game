'use client';

import { Howl, Howler } from 'howler';

// We use data URIs for simple generated tones to avoid needing external sound files.
// In production, replace these with proper sound file URLs.

interface SoundManager {
  play(sound: SoundName): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
}

export type SoundName =
  | 'deal'
  | 'chip'
  | 'check'
  | 'fold'
  | 'win'
  | 'allin'
  | 'timer_warn'
  | 'raise';

// Preload sounds lazily
const soundCache = new Map<SoundName, Howl>();

function getSoundUrl(name: SoundName): string {
  // Using Freesound-compatible free sounds or generated tones
  // In production, host these on CDN
  const sounds: Record<SoundName, string> = {
    deal: '/sounds/deal.mp3',
    chip: '/sounds/chip.mp3',
    check: '/sounds/check.mp3',
    fold: '/sounds/fold.mp3',
    win: '/sounds/win.mp3',
    allin: '/sounds/allin.mp3',
    timer_warn: '/sounds/timer.mp3',
    raise: '/sounds/raise.mp3',
  };
  return sounds[name];
}

let globalVolume = 0.7;
let globalMuted = false;

export const sounds: SoundManager = {
  play(name: SoundName): void {
    if (globalMuted) return;

    try {
      let howl = soundCache.get(name);
      if (!howl) {
        howl = new Howl({
          src: [getSoundUrl(name)],
          volume: globalVolume,
          preload: true,
          html5: false,
          onloaderror: () => {
            // Silently fail if sound file not found
          },
        });
        soundCache.set(name, howl);
      }
      howl.volume(globalVolume);
      howl.play();
    } catch {
      // Sound playback failed silently
    }
  },

  setVolume(volume: number): void {
    globalVolume = Math.max(0, Math.min(1, volume));
    Howler.volume(globalVolume);
  },

  setMuted(muted: boolean): void {
    globalMuted = muted;
    Howler.mute(muted);
  },
};
