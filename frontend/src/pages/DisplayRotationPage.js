import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import GanttPage from './GanttPage';
import CNCKanbanPage from './CNCKanbanPage';
import useHourlyAnnouncements from '../hooks/useHourlyAnnouncements';
import voiceAnnouncer from '../utils/voiceAnnouncer';
import './DisplayRotationPage.css';

export default function DisplayRotationPage() {
  const navigate = useNavigate();
  const [currentView, setCurrentView] = useState('gantt'); // 'gantt' or 'cnc-kanban'
  const [interval, setInterval] = useState(2); // minutes (default 2)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [entries, setEntries] = useState([]);
  const [machines, setMachines] = useState([]);
  const rotationTimeoutRef = useRef(null);
  const fullscreenRef = useRef(null);

  // Setup hourly voice announcements
  const { voiceEnabled, setVoiceEnabled } = useHourlyAnnouncements(
    entries,
    machines,
    isFullscreen && currentView === 'gantt' && isRunning,
    { rate: 1, pitch: 1, volume: 1 }
  );

  // Handle entries loaded from Gantt Chart
  const handleEntriesLoad = (data) => {
    setEntries(data.entries);
    setMachines(data.machines);
  };

  // Handle automatic rotation
  useEffect(() => {
    if (!isRunning) return;

    if (rotationTimeoutRef.current) {
      clearTimeout(rotationTimeoutRef.current);
    }

    rotationTimeoutRef.current = setTimeout(() => {
      setCurrentView(prev => prev === 'gantt' ? 'cnc-kanban' : 'gantt');
    }, interval * 60 * 1000); // Convert minutes to milliseconds

    return () => {
      if (rotationTimeoutRef.current) {
        clearTimeout(rotationTimeoutRef.current);
      }
    };
  }, [isRunning, interval, currentView]);

  // Handle fullscreen request
  const handleFullscreenToggle = async () => {
    if (!document.fullscreenElement) {
      try {
        await fullscreenRef.current?.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.error('Fullscreen request failed:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.error('Exit fullscreen failed:', err);
      }
    }
  };

  // Monitor fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle escape key to exit rotation
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        setIsRunning(false);
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="display-rotation-container" ref={fullscreenRef}>
      {/* Control Panel - Hidden in fullscreen */}
      {!isFullscreen && (
        <div className="rotation-control-panel">
          <div className="control-section">
            <h2>Display Rotation Dashboard</h2>
          </div>

          <div className="control-section">
            <label htmlFor="view-select">Current View:</label>
            <select
              id="view-select"
              value={currentView}
              onChange={(e) => setCurrentView(e.target.value)}
              disabled={isRunning}
            >
              <option value="gantt">Gantt Chart</option>
              <option value="cnc-kanban">CNC Manufacturing Kanban</option>
            </select>
            <span className="view-badge">{currentView === 'gantt' ? 'Gantt Chart' : 'CNC Kanban'}</span>
          </div>

          <div className="control-section">
            <label htmlFor="interval-select">Rotation Interval:</label>
            <div className="interval-input-wrapper">
              <input
                id="interval-select"
                type="range"
                min="1"
                max="10"
                value={interval}
                onChange={(e) => setInterval(Number(e.target.value))}
                disabled={isRunning}
                className="interval-slider"
              />
              <span className="interval-display">{interval} min</span>
            </div>
            <small>Adjust between 1 and 10 minutes</small>
          </div>

          <div className="control-section">
            <button
              className={`btn-start-rotation ${isRunning ? 'running' : ''}`}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? '⏸ Stop Rotation' : '▶ Start Rotation'}
            </button>
            {isRunning && (
              <div className="rotation-status">
                <span className="status-dot"></span>
                Rotating every {interval} minute{interval !== 1 ? 's' : ''}
              </div>
            )}
          </div>

          <div className="control-section">
            {currentView === 'gantt' && (
              <button
                className={`btn-voice ${voiceEnabled ? 'active' : ''}`}
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                title={voiceEnabled ? 'Voice announcements ON' : 'Voice announcements OFF'}
              >
                {voiceEnabled ? '🔊 Voice ON' : '🔇 Voice OFF'}
              </button>
            )}
          </div>

          <div className="control-section">
            <button
              className="btn-fullscreen"
              onClick={handleFullscreenToggle}
              title="Enter fullscreen mode"
            >
              ⛶ Fullscreen
            </button>
          </div>

          <div className="control-section">
            <button
              className="btn-back"
              onClick={() => navigate(-1)}
              title="Go back"
            >
              ← Back
            </button>
          </div>
        </div>
      )}

      {/* Display Area */}
      <div className={`display-area ${isFullscreen ? 'fullscreen' : ''}`}>
        {currentView === 'gantt' ? (
          <div className="view-wrapper gantt-wrapper">
            <GanttPage hideLayout={true} onEntriesLoad={handleEntriesLoad} />
          </div>
        ) : (
          <div className="view-wrapper cnc-kanban-wrapper">
            <CNCKanbanPage />
          </div>
        )}
      </div>

      {/* Fullscreen Exit Hint */}
      {isFullscreen && (
        <div className="fullscreen-hint">
          <p>Press ESC to exit rotation | Switching to {currentView === 'gantt' ? 'CNC Kanban' : 'Gantt Chart'}</p>
        </div>
      )}
    </div>
  );
}
