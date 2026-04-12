import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null = checking, false = not auth
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/auth/me`, {
        withCredentials: true
      });
      setUser(data);
    } catch (error) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Heartbeat to track online status + check if force_logout
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(async () => {
      try {
        await axios.post(`${API_URL}/api/heartbeat`, {}, { withCredentials: true });
      } catch (err) {
        if (err.response?.status === 403 || err.response?.status === 401) {
          // Force logout (banned or token invalid)
          setUser(false);
        }
      }
    }, 30000); // Every 30 seconds
    return () => clearInterval(interval);
  }, [user]);

  const login = async (username, password) => {
    const { data } = await axios.post(`${API_URL}/api/auth/login`, 
      { username, password },
      { withCredentials: true }
    );
    if (!data.requires_verification) {
      setUser(data);
    }
    return data;
  };

  const verifySecurity = async (username, securityAnswer) => {
    const { data } = await axios.post(`${API_URL}/api/auth/verify-security`,
      { username, security_answer: securityAnswer },
      { withCredentials: true }
    );
    setUser(data);
    return data;
  };

  const sendVerificationCode = async (email) => {
    const { data } = await axios.post(`${API_URL}/api/auth/send-verification`,
      { email },
      { withCredentials: true }
    );
    return data;
  };

  const register = async (username, password, email) => {
    const { data } = await axios.post(`${API_URL}/api/auth/register`,
      { username, password, email },
      { withCredentials: true }
    );
    setUser(data);
    return data;
  };

  const logout = async () => {
    await axios.post(`${API_URL}/api/auth/logout`, {}, { withCredentials: true });
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth, verifySecurity, sendVerificationCode }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
