import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthContext = createContext(null);

// Store token in memory
let storedToken = localStorage.getItem('access_token') || null;

// Set up axios interceptor to always include token
axios.interceptors.request.use((config) => {
  if (storedToken) {
    config.headers.Authorization = `Bearer ${storedToken}`;
  }
  config.withCredentials = true;
  return config;
});

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

  const saveToken = (token) => {
    storedToken = token;
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
  };

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/auth/me`);
      setUser(data);
    } catch (error) {
      saveToken(null);
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
        await axios.post(`${API_URL}/api/heartbeat`, {});
      } catch (err) {
        if (err.response?.status === 403 || err.response?.status === 401) {
          saveToken(null);
          setUser(false);
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const login = async (username, password) => {
    const { data } = await axios.post(`${API_URL}/api/auth/login`, { username, password });
    if (data.access_token) {
      saveToken(data.access_token);
    }
    if (!data.requires_verification) {
      setUser(data);
    }
    return data;
  };

  const verifySecurity = async (username, securityAnswer) => {
    const { data } = await axios.post(`${API_URL}/api/auth/verify-security`, {
      username,
      security_answer: securityAnswer
    });
    if (data.access_token) {
      saveToken(data.access_token);
    }
    setUser(data);
    return data;
  };

  const sendVerificationCode = async (email) => {
    const { data } = await axios.post(`${API_URL}/api/auth/send-verification`, { email });
    return data;
  };

  const register = async (username, password, email) => {
    const { data } = await axios.post(`${API_URL}/api/auth/register`, { username, password, email });
    if (data.access_token) {
      saveToken(data.access_token);
    }
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await axios.post(`${API_URL}/api/auth/logout`, {});
    } catch {}
    saveToken(null);
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, checkAuth, verifySecurity, sendVerificationCode }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
