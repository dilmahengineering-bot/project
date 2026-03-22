import React, { useState } from 'react';
import voiceAnnouncer from '../../utils/voiceAnnouncer';
import { generateStatusSummary, generateDetailedStatusByMachine } from '../../utils/statusSummary';
import './VoiceStatusButton.css';

export default function VoiceStatusButton({ entries = [], machines = [], variant = 'button' }) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDetailedMode, setIsDetailedMode] = useState(false);

  const handleReadStatus = async () => {
    try {
      setIsSpeaking(true);
      // Read summary first with bell sound and attention prefix
      const summaryText = generateStatusSummary(entries, machines);
      await voiceAnnouncer.announceWithBell(summaryText, { rate: 0.9, pitch: 1, volume: 1 });
      
      // If detailed mode and there are multiple machines with jobs, read detailed breakdown
      if (isDetailedMode) {
        const machineJobs = {};
        entries.forEach(e => {
          const name = e.machine_name || 'Unknown';
          if (!machineJobs[name]) machineJobs[name] = 0;
          machineJobs[name]++;
        });

        if (Object.keys(machineJobs).length > 1) {
          const detailedText = generateDetailedStatusByMachine(entries, machines);
          // Add small delay before detailed announcement
          await new Promise(resolve => setTimeout(resolve, 500));
          await voiceAnnouncer.announceWithBell(detailedText, { rate: 0.9, pitch: 1, volume: 1 });
        }
      }

      setIsSpeaking(false);
    } catch (err) {
      console.error('Failed to read status:', err);
      setIsSpeaking(false);
    }
  };

  if (variant === 'fab') {
    // Floating Action Button style with long press for detailed
    return (
      <div className="fab-container">
        <button
          className={`voice-status-fab ${isSpeaking ? 'speaking' : ''}`}
          onClick={handleReadStatus}
          onContextMenu={(e) => {
            e.preventDefault();
            setIsDetailedMode(!isDetailedMode);
          }}
          disabled={isSpeaking}
          title={`Read status (${isDetailedMode ? 'detailed' : 'summary'} mode). Right-click to toggle.`}
        >
          <span className="fab-icon">🎤</span>
        </button>
        {isDetailedMode && (
          <div className="fab-badge">Detailed</div>
        )}
      </div>
    );
  }

  // Standard button style
  return (
    <button
      className={`voice-status-btn ${isSpeaking ? 'speaking' : ''} ${isDetailedMode ? 'detailed-mode' : ''}`}
      onClick={handleReadStatus}
      title={`Click to read status. Right-click to toggle detailed mode. Currently: ${isDetailedMode ? 'Detailed' : 'Summary'}`}
      onContextMenu={(e) => {
        e.preventDefault();
        setIsDetailedMode(!isDetailedMode);
      }}
      disabled={isSpeaking}
    >
      {isSpeaking ? (
        <>
          <span className="btn-spinner">●</span> Reading...
        </>
      ) : (
        <>
          🎤 {isDetailedMode ? 'Details' : 'Status'}
        </>
      )}
    </button>
  );
}
