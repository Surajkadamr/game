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
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioCtxRef = useRef<AudioContext | null>(null);
  const speakRafRef = useRef<number>(0);
  const isInVoiceRef = useRef(false);
  const playerIdRef = useRef(playerId);
  const tableIdRef = useRef(tableId);

  // Keep refs in sync so closures always read latest values
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { tableIdRef.current = tableId; }, [tableId]);

  // ── Peer connection management ────────────────────────────────────────────

  const startRemoteSpeakDetect = useCallback((peerId: string, stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(stream);
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
        avg > 15 ? next.add(peerId) : next.delete(peerId);
        return next;
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  const closePeer = useCallback((peerId: string) => {
    peerConnsRef.current.get(peerId)?.close();
    peerConnsRef.current.delete(peerId);
    const audio = audioElsRef.current.get(peerId);
    if (audio) {
      audio.srcObject = null;
      audioElsRef.current.delete(peerId);
    }
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

    // Add local mic tracks so the remote peer hears us
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // ICE candidate ready — relay through server
    pc.onicecandidate = (e) => {
      if (!e.candidate || !playerIdRef.current) return;
      const { getSocket } = require('@/lib/socket');
      getSocket().emit('voice:signal', {
        targetPeerId: peerId,
        signal: e.candidate.toJSON(),
      });
    };

    // Remote audio track received — play it
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      let audio = audioElsRef.current.get(peerId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioElsRef.current.set(peerId, audio);
      }
      audio.srcObject = stream;
      audio.play().catch(() => {});
      startRemoteSpeakDetect(peerId, stream);
    };

    // Initiator creates offer when negotiation is needed
    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          if (!playerIdRef.current) return;
          const { getSocket } = require('@/lib/socket');
          getSocket().emit('voice:signal', {
            targetPeerId: peerId,
            signal: offer,
            isOffer: true,
          });
        } catch (err) {
          console.error('[Voice] Failed to create offer:', err);
        }
      };
    }

    return pc;
  }, [startRemoteSpeakDetect]);

  // ── Socket event listeners ────────────────────────────────────────────────

  useEffect(() => {
    const { getSocket } = require('@/lib/socket');
    const socket = getSocket();

    // Server sends the list of peers already in the room — we initiate to each
    const onPeers = ({ peers }: { peers: VoicePeer[] }) => {
      setVoicePeers(peers);
      for (const peer of peers) {
        getPeerConn(peer.peerId, true);
      }
    };

    // A new peer joined — they will send us an offer, so we just track them
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
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        if (signal.type === 'offer') {
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('voice:signal', {
            targetPeerId: fromPeerId,
            signal: answer,
          });
        }
      } else {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal));
        } catch {
          // ICE candidate arrived before remote description — ignore
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
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;

      // Set up AudioContext for local speaking detection
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!isInVoiceRef.current) return;
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setIsSpeaking(avg > 15);
        speakRafRef.current = requestAnimationFrame(tick);
      };
      speakRafRef.current = requestAnimationFrame(tick);

      isInVoiceRef.current = true;
      setIsInVoice(true);
      setMicError(null);

      const { getSocket } = require('@/lib/socket');
      getSocket().emit('voice:join', { tableId: tableIdRef.current });
    } catch (err: any) {
      setMicError(
        err.name === 'NotAllowedError' ? 'Microphone permission denied' : 'Microphone unavailable',
      );
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

  // Cleanup when component unmounts
  useEffect(() => {
    return () => { leaveVoice(); };
  }, [leaveVoice]);

  return { isInVoice, isMuted, micError, voicePeers, speakingPeers, isSpeaking, joinVoice, leaveVoice, toggleMute };
}
