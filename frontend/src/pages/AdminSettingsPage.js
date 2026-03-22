import React, { useState, useEffect } from 'react';
import './AdminSettingsPage.css';
import {
  getSettings,
  updateSettings,
  resetSettings,
  setTimezone,
  setBusinessHours,
  COMMON_TIMEZONES,
  DEFAULT_SETTINGS,
} from '../services/settingsService';

const AdminSettingsPage = () => {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    // Listen for settings changes from other sources
    const handleSettingsChanged = (event) => {
      setSettings(event.detail.current);
      setHasChanges(false);
    };

    window.addEventListener('settingsChanged', handleSettingsChanged);
    return () => window.removeEventListener('settingsChanged', handleSettingsChanged);
  }, []);

  const loadSettings = () => {
    try {
      const currentSettings = getSettings();
      setSettings(currentSettings);
      setHasChanges(false);
    } catch (error) {
      setErrorMessage('Failed to load settings');
      console.error('Error loading settings:', error);
    }
  };

  const handleSettingChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setHasChanges(true);
    setSuccessMessage('');
  };

  const handleTimezoneChange = (e) => {
    handleSettingChange('timezone', e.target.value);
  };

  const handleDateFormatChange = (e) => {
    handleSettingChange('dateFormat', e.target.value);
  };

  const handleTimeFormatChange = (e) => {
    handleSettingChange('timeFormat', e.target.value);
  };

  const handleBusinessHoursChange = (field, value) => {
    const newValue = Math.max(0, Math.min(24, parseInt(value) || 0));
    if (field === 'start') {
      handleSettingChange('businessHoursStart', newValue);
    } else {
      handleSettingChange('businessHoursEnd', newValue);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      // Validate business hours
      if (settings.businessHoursStart >= settings.businessHoursEnd) {
        setErrorMessage('Business start time must be before end time');
        setIsSaving(false);
        return;
      }

      const updatedSettings = updateSettings({
        timezone: settings.timezone,
        dateFormat: settings.dateFormat,
        timeFormat: settings.timeFormat,
        businessHoursStart: settings.businessHoursStart,
        businessHoursEnd: settings.businessHoursEnd,
      });

      setSettings(updatedSettings);
      setHasChanges(false);
      setSuccessMessage('Settings saved successfully!');

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (error) {
      setErrorMessage('Failed to save settings: ' + error.message);
      console.error('Error saving settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetSettings = async () => {
    if (window.confirm('Are you sure you want to reset all settings to defaults?')) {
      setIsSaving(true);
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const defaultSettings = resetSettings();
        setSettings(defaultSettings);
        setHasChanges(false);
        setSuccessMessage('Settings reset to defaults');

        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (error) {
        setErrorMessage('Failed to reset settings: ' + error.message);
        console.error('Error resetting settings:', error);
      } finally {
        setIsSaving(false);
      }
    }
  };

  const getTimezoneLabel = (tz) => {
    const timezoneObj = COMMON_TIMEZONES.find(t => t.name === tz);
    return timezoneObj ? timezoneObj.label : tz;
  };

  return (
    <div className="admin-settings-page">
      <div className="settings-container">
        <h1>Admin Settings</h1>

        {successMessage && (
          <div className="alert alert-success">
            ✓ {successMessage}
          </div>
        )}

        {errorMessage && (
          <div className="alert alert-error">
            ✗ {errorMessage}
          </div>
        )}

        {/* Timezone Settings */}
        <div className="settings-section">
          <h2>Timezone Configuration</h2>
          <div className="setting-group">
            <label htmlFor="timezone">Timezone</label>
            <select
              id="timezone"
              value={settings.timezone}
              onChange={handleTimezoneChange}
              className="select-field"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz.name} value={tz.name}>
                  {tz.label}
                </option>
              ))}
            </select>
            <p className="help-text">
              Select the timezone for the application. All times will be displayed in this timezone.
            </p>
          </div>
        </div>

        {/* Date & Time Format Settings */}
        <div className="settings-section">
          <h2>Date & Time Formats</h2>

          <div className="setting-group">
            <label htmlFor="dateFormat">Date Format</label>
            <select
              id="dateFormat"
              value={settings.dateFormat}
              onChange={handleDateFormatChange}
              className="select-field"
            >
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </div>

          <div className="setting-group">
            <label htmlFor="timeFormat">Time Format</label>
            <select
              id="timeFormat"
              value={settings.timeFormat}
              onChange={handleTimeFormatChange}
              className="select-field"
            >
              <option value="24h">24-Hour (HH:mm)</option>
              <option value="12h">12-Hour (hh:mm AM/PM)</option>
            </select>
          </div>
        </div>

        {/* Business Hours Settings */}
        <div className="settings-section">
          <h2>Business Hours</h2>
          <p className="help-text">
            Set the business hours for the organization. These hours are used for scheduling and availability tracking.
          </p>

          <div className="business-hours-container">
            <div className="setting-group">
              <label htmlFor="businessHoursStart">Start Time (Hour)</label>
              <div className="input-group">
                <input
                  id="businessHoursStart"
                  type="number"
                  min="0"
                  max="24"
                  value={settings.businessHoursStart}
                  onChange={(e) => handleBusinessHoursChange('start', e.target.value)}
                  className="number-input"
                />
                <span className="time-label">:00 (24-hour format)</span>
              </div>
            </div>

            <div className="setting-group">
              <label htmlFor="businessHoursEnd">End Time (Hour)</label>
              <div className="input-group">
                <input
                  id="businessHoursEnd"
                  type="number"
                  min="0"
                  max="24"
                  value={settings.businessHoursEnd}
                  onChange={(e) => handleBusinessHoursChange('end', e.target.value)}
                  className="number-input"
                />
                <span className="time-label">:00 (24-hour format)</span>
              </div>
            </div>
          </div>

          <p className="info-text">
            Current business hours: {String(settings.businessHoursStart).padStart(2, '0')}:00 - {String(settings.businessHoursEnd).padStart(2, '0')}:00
          </p>
        </div>

        {/* Action Buttons */}
        <div className="settings-actions">
          <button
            className="btn btn-primary"
            onClick={handleSaveSettings}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Settings'}
          </button>

          <button
            className="btn btn-secondary"
            onClick={loadSettings}
            disabled={!hasChanges || isSaving}
          >
            Discard Changes
          </button>

          <button
            className="btn btn-danger"
            onClick={handleResetSettings}
            disabled={isSaving}
          >
            Reset to Defaults
          </button>
        </div>

        {/* Current Settings Display */}
        <div className="settings-section settings-info">
          <h3>Current Settings Summary</h3>
          <ul>
            <li><strong>Timezone:</strong> {getTimezoneLabel(settings.timezone)}</li>
            <li><strong>Date Format:</strong> {settings.dateFormat}</li>
            <li><strong>Time Format:</strong> {settings.timeFormat === '24h' ? '24-Hour' : '12-Hour'}</li>
            <li><strong>Business Hours:</strong> {String(settings.businessHoursStart).padStart(2, '0')}:00 - {String(settings.businessHoursEnd).padStart(2, '0')}:00</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;
