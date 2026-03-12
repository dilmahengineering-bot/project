import io from 'socket.io-client';

class SocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    if (this.socket?.connected) return;

    const serverURL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
    
    this.socket = io(serverURL, {
      auth: {
        token
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      console.log('✅ Connected to WebSocket server');
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ WebSocket connection error:', error);
    });

    this.socket.on('disconnect', () => {
      console.log('👋 Disconnected from WebSocket server');
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Subscribe to a specific event type
  on(eventName, callback) {
    if (!this.socket) {
      console.warn('Socket not connected');
      return;
    }

    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push(callback);

    // Register the socket listener
    this.socket.on(eventName, callback);
  }

  // Unsubscribe from an event
  off(eventName, callback) {
    if (!this.socket) return;

    if (this.listeners.has(eventName)) {
      const callbacks = this.listeners.get(eventName);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }

    this.socket.off(eventName, callback);
  }

  // Task events
  onTaskCreated(callback) {
    this.on('task:created', callback);
  }

  onTaskUpdated(callback) {
    this.on('task:updated', callback);
  }

  onTaskCompleted(callback) {
    this.on('task:completed', callback);
  }

  onTaskConfirmed(callback) {
    this.on('task:confirmed', callback);
  }

  onTaskDeleted(callback) {
    this.on('task:deleted', callback);
  }

  // Extension events
  onExtensionRequested(callback) {
    this.on('extension:requested', callback);
  }

  onExtensionApproved(callback) {
    this.on('extension:approved', callback);
  }

  onExtensionRejected(callback) {
    this.on('extension:rejected', callback);
  }

  // Unsubscribe from all listeners for a specific event
  unsubscribeAll(eventName) {
    if (!this.socket) return;

    const callbacks = this.listeners.get(eventName) || [];
    callbacks.forEach(callback => {
      this.socket.off(eventName, callback);
    });
    this.listeners.delete(eventName);
  }

  // Check if socket is connected
  isConnected() {
    return this.socket && this.socket.connected;
  }
}

// Export singleton instance
export default new SocketService();
