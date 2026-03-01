'use client';

import type { VoicePeer } from '@/hooks/useVoiceChat';

interface VoicePanelProps {
  isInVoice: boolean;
  isMuted: boolean;
  micError: string | null;
  voicePeers: VoicePeer[];
  speakingPeers: Set<string>;
  isSpeaking: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onToggleMute: () => void;
}

// Shared button size: 30×30 to fit the 44px header on mobile
const BTN = {
  width: 30,
  height: 30,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  transition: 'opacity 0.15s, box-shadow 0.15s',
  flexShrink: 0,
} as const;

export function VoicePanel({
  isInVoice,
  isMuted,
  micError,
  voicePeers,
  speakingPeers,
  isSpeaking,
  onJoin,
  onLeave,
  onToggleMute,
}: VoicePanelProps) {
  if (!isInVoice) {
    return (
      <button
        onClick={onJoin}
        title={micError ?? 'Join voice chat'}
        style={{
          ...BTN,
          background: micError ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${micError ? 'rgba(239,68,68,0.35)' : 'rgba(255,255,255,0.12)'}`,
          color: micError ? '#ef4444' : 'rgba(255,255,255,0.5)',
        }}
      >
        {micError ? '🚫' : '🎙️'}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/* Mute / unmute */}
      <button
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute mic'}
        style={{
          ...BTN,
          background: isMuted
            ? 'rgba(239,68,68,0.2)'
            : isSpeaking
            ? 'rgba(56,161,105,0.25)'
            : 'rgba(255,255,255,0.07)',
          border: isMuted
            ? '1px solid rgba(239,68,68,0.4)'
            : isSpeaking
            ? '1px solid rgba(56,161,105,0.5)'
            : '1px solid rgba(255,255,255,0.12)',
          boxShadow: isSpeaking && !isMuted ? '0 0 8px rgba(56,161,105,0.45)' : 'none',
        }}
      >
        {isMuted ? '🔇' : '🎙️'}
      </button>

      {/* Peer count badge — compact on mobile, avatars on desktop */}
      {voicePeers.length > 0 && (
        <>
          {/* Mobile: just a small count bubble */}
          <span
            className="sm:hidden text-[10px] font-bold rounded-full px-1.5 py-0.5"
            style={{
              background: 'rgba(56,161,105,0.2)',
              border: '1px solid rgba(56,161,105,0.35)',
              color: '#38a169',
            }}
          >
            {voicePeers.length}
          </span>

          {/* Desktop: avatar stack */}
          <div className="hidden sm:flex items-center -space-x-1.5">
            {voicePeers.slice(0, 3).map((peer) => {
              const speaking = speakingPeers.has(peer.peerId);
              return (
                <div
                  key={peer.peerId}
                  title={peer.playerName}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                  style={{
                    background: speaking ? '#16a34a' : '#374151',
                    border: '1.5px solid rgba(0,0,0,0.5)',
                    boxShadow: speaking ? '0 0 6px rgba(22,163,74,0.7)' : 'none',
                    transition: 'background 0.2s, box-shadow 0.2s',
                  }}
                >
                  {peer.playerName[0]?.toUpperCase()}
                </div>
              );
            })}
            {voicePeers.length > 3 && (
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white/50"
                style={{ background: '#1f2937', border: '1.5px solid rgba(0,0,0,0.5)' }}
              >
                +{voicePeers.length - 3}
              </div>
            )}
          </div>
        </>
      )}

      {/* Leave voice */}
      <button
        onClick={onLeave}
        title="Leave voice chat"
        style={{
          ...BTN,
          width: 26,
          height: 26,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.25)',
          color: 'rgba(239,68,68,0.8)',
          fontSize: 11,
        }}
      >
        ✕
      </button>
    </div>
  );
}
