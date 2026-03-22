import React, { useState } from 'react';
import voiceAnnouncer from '../../utils/voiceAnnouncer';
import { generateStatusSummary, generateMachineStatusSummary } from '../../utils/statusSummary';
import './VoiceStatusButton.css';

export default function VoiceStatusButton({ entries = [], machines = [], variant = 'button' }) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const handleReadStatus = async () => {
    try {
      setIsSpeaking(true);
      const statusText = generateStatusSummary(entries, machines);
      await voiceAnnouncer.speak(statusText, { rate: 0.9, pitch: 1, volume: 1 });
      setIsSpeaking(false);
    } catch (err) {
      console.error('Failed to read status:', err);
      setIsSpeaking(false);
    }
  };

  if (variant === 'fab') {
    // Floating Action Button style
    return (
      <button
        className={`voice-status-fab ${isSpeaking ? 'speaking' : ''}`}
        onClick={handleReadStatus}
        disabled={isSpeaking}
        title="Read current status"
      >
        <span className="fab-icon">🎤</span>
      </button>
    );
  }

  // Standard button style
  return (
    <button
      className={`voice-status-btn ${isSpeaking ? 'speaking' : ''}`}
      onClick={handleReadStatus}
      disabled={isSpeaking}
      title="Read current status"
    >
      {isSpeaking ? (
        <>
          <span className="btn-spinner">●</span> Reading...
        </>
      ) : (
        <>
          🎤 Read Status
        </>
      )}
    </button>
  );
}
