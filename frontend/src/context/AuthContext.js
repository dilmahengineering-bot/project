import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import socketService from '../services/socket';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('tf_token');
    const savedUser = localStorage.getItem('tf_user');
    if (token && savedUser) {
      setUser(JSON.parse(savedUser));
      // Connect socket with token
      socketService.connect(token);
      
      api.get('/auth/me').then(res => {
        setUser(res.data.user);
      }).catch(() => {
        localStorage.removeItem('tf_token');
        localStorage.removeItem('tf_user');
        socketService.disconnect();
        setUser(null);
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    localStorage.setItem('tf_token', res.data.token);
    localStorage.setItem('tf_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
    
    // Connect socket with token on login
    socketService.connect(res.data.token);
    
    return res.data.user;
  };

  const logout = () => {
    localStorage.removeItem('tf_token');
    localStorage.removeItem('tf_user');
    socketService.disconnect();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
