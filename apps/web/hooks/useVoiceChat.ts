'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

// ── ICE server configuration ───────────────────────────────────────────────
// Priority order: STUN (direct P2P) → TURN UDP → TURN TCP → TURNS TLS
// TURNS on port 443 is the most firewall-friendly — works even through HTTPS proxies.
const _customTurnUrl  = process.env.NEXT_PUBLIC_TURN_URL;
const _customTurnUser = process.env.NEXT_PUBLIC_TURN_USERNAME;
const _customTurnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  // Public TURN relay — no account needed; always used as fallback
  {
    urls: [
      'turn:openrelay.metered.ca:80',                     // UDP, port 80
      'turn:openrelay.metered.ca:443',                    // UDP, port 443
      'turn:openrelay.metered.ca:443?transport=tcp',      // TCP, port 443
      'turns:openrelay.metered.ca:443?transport=tcp',     // TURN over TLS — passes HTTPS firewalls
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  // Optional custom TURN (set env vars to override)
  ...(_customTurnUrl
    ? [{
        urls: _customTurnUrl.split(',').map((u) => u.trim()),
        username: _customTurnUser ?? '',
        credential: _customTurnCred ?? '',
      }]
    : []),
];

// RTCPeerConnection config shared by all peers.
// max-bundle: bundle all media over one port → fewer ports to punch through firewalls.
const PC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceTransportPolicy: 'all', // 'relay' to force TURN (useful for debugging)
};

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

  const localStreamRef    = useRef<MediaStream | null>(null);
  const peerConnsRef      = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteSourcesRef  = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const audioCtxRef       = useRef<AudioContext | null>(null);
  const speakRafRef       = useRef<number>(0);
  const isInVoiceRef      = useRef(false);
  // Track mute state ourselves — never re-read track.enabled after writing
  // (iOS Safari getter can return stale value right after a set)
  const isMutedRef        = useRef(false);
  const playerIdRef       = useRef(playerId);
  const tableIdRef        = useRef(tableId);
  // ICE candidate queue: holds candidates that arrive before setRemoteDescription
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  // Offer guard: prevents duplicate onnegotiationneeded triggers
  const makingOfferRef    = useRef<Set<string>>(new Set());
  // Initiator map: who opened the connection (only the initiator can restart ICE)
  const peerInitiatorRef  = useRef<Map<string, boolean>>(new Map());
  // Pending reconnect timers keyed by peerId
  const reconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { tableIdRef.current = tableId; }, [tableId]);

  // ── Remote speaking detection ─────────────────────────────────────────────

  const startRemoteSpeakDetect = useCallback((peerId: string, stream: MediaStream) => {
    const ctx = audioCtxRef.current;
    if (!ctx || ctx.state === 'closed') return;

    remoteSourcesRef.current.get(peerId)?.disconnect();

    const source = ctx.createMediaStreamSource(stream);
    remoteSourcesRef.current.set(peerId, source);

    // Route audio through AudioContext → speakers (fixes iOS autoplay)
    source.connect(ctx.destination);

    // Speaking-level analyser for visual indicators
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
    // Cancel any pending ICE-restart timer for this peer
    const t = reconnectTimersRef.current.get(peerId);
    if (t) { clearTimeout(t); reconnectTimersRef.current.delete(peerId); }

    peerInitiatorRef.current.delete(peerId);
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

    const pc = new RTCPeerConnection(PC_CONFIG);
    peerConnsRef.current.set(peerId, pc);
    peerInitiatorRef.current.set(peerId, initiator);

    // Add local mic tracks to the offer/answer SDP immediately
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        pc.addTrack(track, localStreamRef.current);
      }
    }

    // ── ICE candidate relay ────────────────────────────────────────────────
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const { getSocket } = require('@/lib/socket');
      getSocket().emit('voice:signal', {
        targetPeerId: peerId,
        signal: e.candidate.toJSON(),
      });
    };

    // ── Remote audio track ────────────────────────────────────────────────
    pc.ontrack = (e) => {
      // Some Android browsers don't populate e.streams — build one from the track
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      startRemoteSpeakDetect(peerId, stream);
    };

    // ── ICE connection state: auto-restart on failure ─────────────────────
    // This is what makes voice survive network changes (WiFi ↔ 4G)
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;

      if (state === 'connected' || state === 'completed') {
        // Clear any pending restart timer — connection is healthy
        const t = reconnectTimersRef.current.get(peerId);
        if (t) { clearTimeout(t); reconnectTimersRef.current.delete(peerId); }
        return;
      }

      // Only the connection initiator drives ICE restart
      // (both sides sending a new offer simultaneously would break things)
      if (!peerInitiatorRef.current.get(peerId)) return;

      if (state === 'disconnected') {
        // "disconnected" is often transient (network hiccup). Wait 4 s before restarting.
        if (reconnectTimersRef.current.has(peerId)) return; // already scheduled
        const t = setTimeout(async () => {
          reconnectTimersRef.current.delete(peerId);
          if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return;
          if (peerConnsRef.current.get(peerId) !== pc) return; // peer was replaced
          await doIceRestart(pc, peerId);
        }, 4000);
        reconnectTimersRef.current.set(peerId, t);

      } else if (state === 'failed') {
        // "failed" is definitive — restart immediately
        const t = reconnectTimersRef.current.get(peerId);
        if (t) { clearTimeout(t); reconnectTimersRef.current.delete(peerId); }
        if (peerConnsRef.current.get(peerId) !== pc) return;
        doIceRestart(pc, peerId);
      }
    };

    // ── Offer creation (initiator only) ───────────────────────────────────
    if (initiator) {
      pc.onnegotiationneeded = async () => {
        if (makingOfferRef.current.has(peerId)) return;
        if (pc.signalingState !== 'stable') return;
        makingOfferRef.current.add(peerId);
        try {
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
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

    // ── ICE restart helper (scoped to this peer conn) ─────────────────────
    async function doIceRestart(conn: RTCPeerConnection, pid: string) {
      if ((conn.connectionState as string) === 'closed') return;
      if (makingOfferRef.current.has(pid)) return;
      makingOfferRef.current.add(pid);
      console.log(`[Voice] ICE restart → ${pid}`);
      try {
        const offer = await conn.createOffer({ iceRestart: true });
        if ((conn.connectionState as string) === 'closed') return;
        await conn.setLocalDescription(offer);
        const { getSocket } = require('@/lib/socket');
        getSocket().emit('voice:signal', {
          targetPeerId: pid,
          signal: conn.localDescription,
          isOffer: true,
        });
      } catch (err) {
        console.error('[Voice] ICE restart failed, closing peer:', err);
        closePeer(pid);
      } finally {
        makingOfferRef.current.delete(pid);
      }
    }

    return pc;
  }, [startRemoteSpeakDetect, closePeer]);

  // ── Socket event listeners ────────────────────────────────────────────────

  useEffect(() => {
    const { getSocket } = require('@/lib/socket');
    const socket = getSocket();

    // We just joined — server sends existing peers; we initiate a connection to each
    const onPeers = ({ peers }: { peers: VoicePeer[] }) => {
      setVoicePeers(peers);
      for (const peer of peers) {
        getPeerConn(peer.peerId, true);
      }
    };

    // A new peer joined — they are the initiator and will send us an offer
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
        // ── SDP offer or answer ──────────────────────────────────────────
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        } catch (err) {
          console.error('[Voice] setRemoteDescription failed:', err);
          return;
        }

        // Flush ICE candidates that arrived before the remote description
        const queued = pendingCandidatesRef.current.get(fromPeerId) ?? [];
        pendingCandidatesRef.current.delete(fromPeerId);
        for (const c of queued) {
          try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
        }

        // Respond to offers with an answer
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
        // ── ICE candidate ────────────────────────────────────────────────
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new RTCIceCandidate(signal)); } catch {}
        } else {
          // Queue until remote description arrives
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
      // This unlocks all future audio playback on iOS (autoplay policy).
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

    // Cancel all pending reconnect timers
    for (const t of reconnectTimersRef.current.values()) clearTimeout(t);
    reconnectTimersRef.current.clear();

    for (const peerId of Array.from(peerConnsRef.current.keys())) {
      closePeer(peerId);
    }

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;

    audioCtxRef.current?.close();
    audioCtxRef.current = null;

    isInVoiceRef.current = false;
    isMutedRef.current = false;
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
    // Use our own ref to track state — never re-read track.enabled after writing
    // (iOS Safari setter/getter can be stale immediately after assignment)
    const willBeMuted = !isMutedRef.current;
    track.enabled = !willBeMuted;
    isMutedRef.current = willBeMuted;
    setIsMuted(willBeMuted);
  }, []);

  useEffect(() => {
    return () => { leaveVoice(); };
  }, [leaveVoice]);

  return { isInVoice, isMuted, micError, voicePeers, speakingPeers, isSpeaking, joinVoice, leaveVoice, toggleMute };
}
