/**
 * Voice Announcer Utility
 * Uses Web Speech API to announce job information
 */

const voiceAnnouncer = {
  isSpeaking: false,
  synth: typeof window !== 'undefined' ? window.speechSynthesis : null,

  /**
   * Play a bell sound using Web Audio API
   * @returns {Promise} - Resolves when bell sound completes
   */
  playBellSound() {
    return new Promise((resolve) => {
      try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        
        osc.connect(gain);
        gain.connect(audioContext.destination);
        
        // Bell sound: quick pitch sweep
        osc.frequency.setValueAtTime(800, audioContext.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gain.gain.setValueAtTime(0.3, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        osc.start(audioContext.currentTime);
        osc.stop(audioContext.currentTime + 0.1);
        
        setTimeout(resolve, 150);
      } catch (e) {
        // If Web Audio API not available, resolve immediately
        console.log('Bell sound not available:', e);
        resolve();
      }
    });
  },

  /**
   * Speak text aloud
   * @param {string} text - Text to speak
   * @param {object} options - Voice options (rate, pitch, volume, lang)
   * @returns {Promise} - Resolves when speech ends
   */
  speak(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.synth) {
        reject(new Error('Speech Synthesis not supported'));
        return;
      }

      // Cancel any ongoing speech
      this.synth.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = options.rate || 1;
      utterance.pitch = options.pitch || 1;
      utterance.volume = options.volume !== undefined ? options.volume : 1;
      utterance.lang = options.lang || 'en-US';

      utterance.onstart = () => {
        this.isSpeaking = true;
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        resolve();
      };

      utterance.onerror = (e) => {
        this.isSpeaking = false;
        reject(e);
      };

      this.synth.speak(utterance);
    });
  },

  /**
   * Announcement with bell sound prefix
   * @param {string} text - Announcement text
   * @param {object} options - Voice options
   * @returns {Promise} - Resolves when complete
   */
  async announceWithBell(text, options = {}) {
    try {
      // Play bell sound first
      await this.playBellSound();
      // Then speak with attention prefix
      const announcement = `Attention everyone. ${text}`;
      await this.speak(announcement, options);
    } catch (e) {
      console.error('Announcement error:', e);
    }
  },

  /**
   * Stop ongoing speech
   */
  stop() {
    if (this.synth) {
      this.synth.cancel();
      this.isSpeaking = false;
    }
  },

  /**
   * Announce job information
   * @param {object} currentJob - Current job details
   * @param {object} nextJob - Next job details
   * @param {object} options - Voice options
   */
  async announceJobs(currentJob, nextJob, options = {}) {
    try {
      let announcement = 'Hourly update. ';

      if (currentJob) {
        announcement += `Current job: ${currentJob.job_card_number}, ${currentJob.job_name}, on machine ${currentJob.machine_name}. `;
      } else {
        announcement += 'No current job. ';
      }

      if (nextJob) {
        announcement += `Next job: ${nextJob.job_card_number}, ${nextJob.job_name}, on machine ${nextJob.machine_name}.`;
      } else {
        announcement += 'No next job scheduled.';
      }

      await this.announceWithBell(announcement, options);
    } catch (err) {
      console.error('Failed to announce jobs:', err);
    }
  },

  /**
   * Get available voices
   */
  getVoices() {
    return this.synth ? this.synth.getVoices() : [];
  },

  /**
   * Set voice by name
   */
  setVoice(voiceName, options = {}) {
    const voices = this.getVoices();
    const selectedVoice = voices.find(v => v.name.includes(voiceName));
    if (selectedVoice) {
      options.voice = selectedVoice;
    }
    return options;
  },
};

export default voiceAnnouncer;
