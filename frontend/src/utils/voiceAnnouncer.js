/**
 * Voice Announcer Utility
 * Uses Web Speech API to announce job information
 */

const voiceAnnouncer = {
  isSpeaking: false,
  synth: typeof window !== 'undefined' ? window.speechSynthesis : null,

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

      await this.speak(announcement, options);
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
