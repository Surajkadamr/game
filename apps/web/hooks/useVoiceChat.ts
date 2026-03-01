'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export interface VoicePeer {
  peerId: string;
  playerName: string;
}

export function useVoiceChat(tableId: string | null, playerId: string | null) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [voicePeers, setVoicePeers] = useState<VoicePeer[]>([]);
  const [speakingPeers, setSpeakingPeers] = useState<Set<string>>(new Set());
  const [isSpeaking, setIsSpeaking] = useState(false);

  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Audio nodes routed through AudioContext (fixes iOS autoplay policy)
  const remoteSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const speakRafRef = useRef<number>(0);
  const isInVoiceRef = useRef(false);
  const playerIdRef = useRef(playerId);
  const tableIdRef = useRef(tableId);
  // Queue ICE candidates that arrive before setRemoteDescription
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Guard against duplicate negotiationneeded triggers
  const makingOfferRef = useRef<Set<string>>(new Set());

  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { tableIdRef.current = tableId; }, [tableId]);

  // ── Remote speaking detection ─────────────────────────────────────────────

  const startRemoteSpeakDetect = useCallback((peerId: string, stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') return;

    // Disconnect any existing source for this peer
    remoteSourcesRef.current.get(peerId)?.disconnect();

    const source = ctx.createMediaStreamSource(stream);
    remoteSourcesRef.current.set(peerId, source);

    // Route audio to speakers through the (already-unlocked) AudioContext
    source.connect(ctx.destination);

    // Speaking detection analyser
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      if (!peerConnsRef.current.has(peerId)) return;
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((a, b) => a + b, 0) / data.length;
      setSpeakingPeers((prev) => {
        const next = new Set(prev);
        avg > 12 ? next.add(peerId) : next.delete(peerId);
        return next;
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  // ── Peer lifecycle ────────────────────────────────────────────────────────

  const closePeer = useCallback((peerId: string) => {
    peerConnsRef.current.get(peerId)?.close();
    peerConnsRef.current.delete(peerId);
    remoteSourcesRef.current.get(peerId)?.disconnect();
    remoteSourcesRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    makingOfferRef.current.delete(peerId);
    setSpeakingPeers((prev) => {
      const next = new Set(prev);
      next.delete(peerId);
      return next;
    });
  }, []);

  const getPeerConn = useCallback((peerId: string, initiator: boolean): RTCPeerConnection => {
    if (peerConnsRef.current.has(peerId)) {
      return peerConnsRef.current.get(peerId)!;
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnsRef.current.set(peerId, pc);

    // Add our mic tracks immediately so they appear in the offer/answer SDP
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // Relay ICE candidates via the server
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const { getSocket } = require('@/lib/socket');
      getSocket().emit('voice:signal', {
        targetPeerId: peerId,
        signal: e.candidate.toJSON(),
      });
    };

    // Remote audio arrives: route through AudioContext (no new Audio() needed)
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (!stream) return;
      startRemoteSpeakDetect(peerId, stream);
    };

    // Initiator side: create offer whenever negotiation is needed
    if (initiator) {
      pc.onnegotiationneeded = async () => {
        // Guard: skip if we're already mid-offer for this peer
        if (makingOfferRef.current.has(peerId)) return;
        if (pc.signalingState !== 'stable') return;
        makingOfferRef.current.add(peerId);
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return; // state changed while async
          await pc.setLocalDescription(offer);
          const { getSocket } = require('@/lib/socket');
          getSocket().emit('voice:signal', {
            targetPeerId: peerId,
            signal: pc.localDescription,
            isOffer: true,
          });
        } catch (err) {
          console.error('[Voice] createOffer failed:', err);
        } finally {
          makingOfferRef.current.delete(peerId);
        }
      };
    }

    return pc;
  }, [startRemoteSpeakDetect]);

  // ── Socket event listeners ────────────────────────────────────────────────

  useEffect(() => {
    const { getSocket } = require('@/lib/socket');
    const socket = getSocket();

    // We just joined — server sends existing peers; we initiate to each
    const onPeers = ({ peers }: { peers: VoicePeer[] }) => {
      setVoicePeers(peers);
      for (const peer of peers) {
        getPeerConn(peer.peerId, true);
      }
    };

    // Another peer joined — they will send us an offer (they're the initiator)
    const onPeerJoined = (peer: VoicePeer) => {
      setVoicePeers((prev) => [...prev.filter((p) => p.peerId !== peer.peerId), peer]);
    };

    const onPeerLeft = ({ peerId }: { peerId: string }) => {
      setVoicePeers((prev) => prev.filter((p) => p.peerId !== peerId));
      closePeer(peerId);
    };

    const onSignal = async ({ fromPeerId, signal, isOffer }: any) => {
      if (!isInVoiceRef.current) return;
      const pc = getPeerConn(fromPeerId, false);

      if ('type' in signal) {
        // ── Offer or Answer ──────────────────────────────────────────────
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        } catch (err) {
          console.error('[Voice] setRemoteDescription failed:', err);
          return;
        }

        // Flush any ICE candidates that arrived before the remote description
        const queued = pendingCandidatesRef.current.get(fromPeerId) ?? [];
        pendingCandidatesRef.current.delete(fromPeerId);
        for (const c of queued) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }

        // If it was an offer, send back an answer
        if (signal.type === 'offer') {
          try {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('voice:signal', {
              targetPeerId: fromPeerId,
              signal: pc.localDescription,
            });
          } catch (err) {
            console.error('[Voice] createAnswer failed:', err);
          }
        }
      } else {
        // ── ICE Candidate ────────────────────────────────────────────────
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(signal)); } catch {}
        } else {
          // Queue until the remote description arrives
          const q = pendingCandidatesRef.current.get(fromPeerId) ?? [];
          q.push(signal);
          pendingCandidatesRef.current.set(fromPeerId, q);
        }
      }
    };

    socket.on('voice:peers', onPeers);
    socket.on('voice:peer_joined', onPeerJoined);
    socket.on('voice:peer_left', onPeerLeft);
    socket.on('voice:signal', onSignal);

    return () => {
      socket.off('voice:peers', onPeers);
      socket.off('voice:peer_joined', onPeerJoined);
      socket.off('voice:peer_left', onPeerLeft);
      socket.off('voice:signal', onSignal);
    };
  }, [getPeerConn, closePeer]);

  // ── Public API ────────────────────────────────────────────────────────────

  const joinVoice = useCallback(async () => {
    if (!tableIdRef.current || !playerIdRef.current || isInVoiceRef.current) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Mic requires HTTPS');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // AudioContext MUST be created/resumed inside a user-gesture handler.
      // This also unlocks all future audio playback (fixes iOS autoplay policy).
      const AudioContextClass = window.AudioContext ?? (window as any).webkitAudioContext;
      const ctx: AudioContext = new AudioContextClass();
      audioCtxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      // Local speaking detection
      const localSource = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      localSource.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!isInVoiceRef.current) return;
        analyser.getByteFrequencyData(data);
        setIsSpeaking(data.reduce((a, b) => a + b, 0) / data.length > 12);
        speakRafRef.current = requestAnimationFrame(tick);
      };
      speakRafRef.current = requestAnimationFrame(tick);

      isInVoiceRef.current = true;
      setIsInVoice(true);
      setMicError(null);

      const { getSocket } = require('@/lib/socket');
      getSocket().emit('voice:join', { tableId: tableIdRef.current });
    } catch (err: any) {
      const msg =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Mic permission denied'
          : err.name === 'NotFoundError'
          ? 'No microphone found'
          : 'Microphone unavailable';
      setMicError(msg);
    }
  }, []);

  const leaveVoice = useCallback(() => {
    if (!isInVoiceRef.current) return;

    cancelAnimationFrame(speakRafRef.current);

    for (const peerId of Array.from(peerConnsRef.current.keys())) {
      closePeer(peerId);
    }

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    isInVoiceRef.current = false;
    setIsInVoice(false);
    setIsMuted(false);
    setVoicePeers([]);
    setSpeakingPeers(new Set());
    setIsSpeaking(false);

    if (tableIdRef.current) {
      const { getSocket } = require('@/lib/socket');
      getSocket().emit('voice:leave', { tableId: tableIdRef.current });
    }
  }, [closePeer]);

  const toggleMute = useCallback(() => {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  useEffect(() => {
    return () => { leaveVoice(); };
  }, [leaveVoice]);

  return { isInVoice, isMuted, micError, voicePeers, speakingPeers, isSpeaking, joinVoice, leaveVoice, toggleMute };
}
