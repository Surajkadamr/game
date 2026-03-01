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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: `1px solid ${micError ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          color: micError ? '#ef4444' : 'rgba(255,255,255,0.45)',
        }}
      >
        <span>{micError ? '🚫' : '🎙️'}</span>
        <span className="hidden sm:block">{micError ? 'Mic denied' : 'Voice'}</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Mute / unmute */}
      <button
        onClick={onToggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-all"
        style={{
          background: isMuted
            ? 'rgba(239,68,68,0.18)'
            : isSpeaking
            ? 'rgba(56,161,105,0.22)'
            : 'rgba(255,255,255,0.07)',
          border: isMuted
            ? '1px solid rgba(239,68,68,0.35)'
            : isSpeaking
            ? '1px solid rgba(56,161,105,0.45)'
            : '1px solid rgba(255,255,255,0.1)',
          boxShadow: isSpeaking && !isMuted ? '0 0 8px rgba(56,161,105,0.4)' : 'none',
        }}
      >
        {isMuted ? '🔇' : '🎙️'}
      </button>

      {/* Peer avatars */}
      {voicePeers.length > 0 && (
        <div className="flex items-center -space-x-1.5">
          {voicePeers.slice(0, 4).map((peer) => {
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
          {voicePeers.length > 4 && (
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white/50"
              style={{ background: '#1f2937', border: '1.5px solid rgba(0,0,0,0.5)' }}
            >
              +{voicePeers.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Leave voice */}
      <button
        onClick={onLeave}
        title="Leave voice"
        className="w-7 h-7 rounded-lg flex items-center justify-center text-xs transition-all"
        style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: 'rgba(239,68,68,0.7)',
        }}
      >
        ✕
      </button>
    </div>
  );
}
