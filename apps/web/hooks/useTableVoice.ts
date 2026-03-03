'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { useGameStore } from '@/stores/gameStore';

export interface VoicePeer {
  peerId: string;
  playerName: string;
}

export function useTableVoice() {
  const voiceToken = useGameStore((s) => s.voiceToken);
  const livekitUrl = useGameStore((s) => s.livekitUrl);

  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [voicePeers, setVoicePeers] = useState<VoicePeer[]>([]);
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const connectingRef = useRef(false);
  // Track attached audio elements so we can clean them up
  const audioElementsRef = useRef<Set<HTMLMediaElement>>(new Set());

  /** Sync remote participant list into voicePeers state */
  const syncPeers = useCallback((room: Room) => {
    const peers: VoicePeer[] = [];
    room.remoteParticipants.forEach((p) => {
      peers.push({ peerId: p.identity, playerName: p.name || p.identity });
    });
    setVoicePeers(peers);
  }, []);

  /** Clean up all attached audio elements */
  const cleanupAudio = useCallback(() => {
    audioElementsRef.current.forEach((el) => {
      el.srcObject = null;
      el.remove();
    });
    audioElementsRef.current.clear();
  }, []);

  /** Reset all voice state */
  const resetState = useCallback(() => {
    setIsInVoice(false);
    setVoicePeers([]);
    setSpeakingPeers(new Set());
    setIsSpeaking(false);
    setIsMuted(false);
    cleanupAudio();
  }, [cleanupAudio]);

  /** Connect to LiveKit room */
  const joinVoice = useCallback(async () => {
    if (roomRef.current || connectingRef.current) return;
    if (!voiceToken || !livekitUrl) {
      setMicError('Voice chat not available');
      return;
    }

    connectingRef.current = true;

    try {
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // ── Room events ──────────────────────────────────────────────
      room.on(RoomEvent.ParticipantConnected, () => syncPeers(room));
      room.on(RoomEvent.ParticipantDisconnected, () => syncPeers(room));

      // Speaking detection (LiveKit provides this out of the box)
      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const ids = new Set(speakers.map((s) => s.identity));
        setSpeakingPeers(ids);

        const localIdentity = room.localParticipant?.identity;
        setIsSpeaking(localIdentity ? ids.has(localIdentity) : false);
      });

      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        resetState();
      });

      // Auto-play remote audio tracks
      // attach() creates a detached <audio> element — we MUST append it to the
      // DOM, otherwise some browsers (iOS Safari) silently refuse to play it.
      room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.id = `lk-audio-${participant.identity}`;
          el.style.display = 'none';
          document.body.appendChild(el);
          audioElementsRef.current.add(el);
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        const detached = track.detach();
        detached.forEach((el) => {
          audioElementsRef.current.delete(el);
          el.srcObject = null;
          el.remove();
        });
      });

      // Reconnection events
      room.on(RoomEvent.Reconnecting, () => {
        console.log('[Voice] Reconnecting to LiveKit...');
      });

      room.on(RoomEvent.Reconnected, () => {
        console.log('[Voice] Reconnected to LiveKit');
        syncPeers(room);
      });

      // ── Connect ──────────────────────────────────────────────────
      await room.connect(livekitUrl, voiceToken);

      // Unlock audio playback on iOS Safari.
      // This MUST be called during the user gesture call stack (button click
      // → joinVoice → here). It resumes the internal AudioContext so that
      // audio elements created later by TrackSubscribed will actually play.
      await room.startAudio();

      // Enable mic — if this fails, still stay connected (can listen)
      try {
        await room.localParticipant.setMicrophoneEnabled(true);
        setIsMuted(false);
        setMicError(null);
      } catch (micErr: any) {
        console.warn('[Voice] Mic access failed, connected in listen-only:', micErr);
        setIsMuted(true);
        if (micErr?.name === 'NotAllowedError') {
          setMicError('Microphone permission denied — you can still listen');
        }
      }

      roomRef.current = room;
      setIsInVoice(true);
      syncPeers(room);
    } catch (err: any) {
      console.error('[Voice] Failed to join:', err);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
        setMicError('Microphone permission denied');
      } else {
        setMicError('Failed to connect to voice');
      }
      roomRef.current = null;
    } finally {
      connectingRef.current = false;
    }
  }, [voiceToken, livekitUrl, syncPeers, resetState]);

  /** Disconnect from LiveKit room */
  const leaveVoice = useCallback(() => {
    const room = roomRef.current;
    if (room) {
      room.disconnect();
      roomRef.current = null;
    }
    resetState();
  }, [resetState]);

  /** Toggle microphone mute */
  const toggleMute = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;

    const newMuted = !isMuted;
    try {
      await room.localParticipant.setMicrophoneEnabled(!newMuted);
      setIsMuted(newMuted);
    } catch (err) {
      console.error('[Voice] Toggle mute failed:', err);
      // If enabling mic fails (permission revoked), stay muted
      if (!newMuted) {
        setMicError('Microphone permission denied');
      }
    }
  }, [isMuted]);

  // Disconnect when component unmounts
  useEffect(() => {
    return () => {
      if (roomRef.current) {
        roomRef.current.disconnect();
        roomRef.current = null;
      }
      cleanupAudio();
    };
  }, [cleanupAudio]);

  // Disconnect if voiceToken is cleared (player left table)
  useEffect(() => {
    if (!voiceToken && roomRef.current) {
      roomRef.current.disconnect();
      roomRef.current = null;
      resetState();
    }
  }, [voiceToken, resetState]);

  return {
    isInVoice,
    isMuted,
    micError,
    voicePeers,
    speakingPeers,
    isSpeaking,
    joinVoice,
    leaveVoice,
    toggleMute,
    /** Whether LiveKit is configured on the server */
    isVoiceAvailable: !!(voiceToken && livekitUrl),
  };
}
