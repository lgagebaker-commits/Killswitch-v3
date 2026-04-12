import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import './AuthPage.css';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const AuthPage = () => {
  const [mode, setMode] = useState('login'); // login, register, verify-email, security-question
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [sentCode, setSentCode] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [pendingUsername, setPendingUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeVerified, setCodeVerified] = useState(false);
  
  // Store registration data to use after email verification
  const [pendingRegData, setPendingRegData] = useState(null);
  const [emailSent, setEmailSent] = useState(false);
  
  const { login, register, verifySecurity, sendVerificationCode } = useAuth();

  const formatError = (detail) => {
    if (detail == null) return "Something went wrong. Please try again.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
      return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    return String(detail);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const data = await login(username, password);
      if (data.requires_verification) {
        setSecurityQuestion(data.security_question);
        setPendingUsername(data.username);
        setMode('security-question');
      }
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSecurityVerify = async (e) => {
    e.preventDefault();
    setError('');
    if (!securityAnswer.trim()) {
      setError('Please answer the security question');
      return;
    }
    setLoading(true);
    try {
      await verifySecurity(pendingUsername, securityAnswer);
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    setError('');
    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    setLoading(true);
    try {
      const data = await sendVerificationCode(email);
      if (data.code) {
        // No email service - show code on screen
        setSentCode(data.code);
      } else {
        // Email was sent via Resend
        setSentCode(null);
      }
      setEmailSent(data.email_sent || false);
      setCodeSent(true);
      setError('');
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }
    if (sentCode) {
      // Code was shown on screen - verify locally
      if (verificationCode.trim() === sentCode) {
        setCodeVerified(true);
      } else {
        setError('Invalid verification code');
      }
    } else {
      // Code was emailed - verify against backend
      setLoading(true);
      try {
        const { data } = await axios.post(`${API_URL}/api/auth/verify-code`, {
          email,
          code: verificationCode.trim()
        });
        if (data.valid) {
          setCodeVerified(true);
        } else {
          setError('Invalid or expired verification code');
        }
      } catch (err) {
        setError('Invalid or expired verification code');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim() || !password.trim() || !email.trim()) {
      setError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }

    if (!codeSent) {
      // Step 1: Send verification code
      setPendingRegData({ username, password, email });
      setMode('verify-email');
      handleSendCode();
      return;
    }

    if (!codeVerified) {
      setError('Please verify your email first');
      return;
    }

    // Final step: actually register
    setLoading(true);
    try {
      await register(username, password, email);
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteRegistration = async () => {
    setError('');
    if (!codeVerified) {
      setError('Please verify your code first');
      return;
    }
    setLoading(true);
    try {
      const data = pendingRegData || { username, password, email };
      await register(data.username, data.password, data.email);
    } catch (err) {
      setError(formatError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchToRegister = () => {
    setMode('register');
    setError('');
    setCodeSent(false);
    setCodeVerified(false);
    setSentCode('');
    setVerificationCode('');
  };

  const switchToLogin = () => {
    setMode('login');
    setError('');
    setSecurityAnswer('');
  };

  // Security Question Screen
  if (mode === 'security-question') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Security Verification</h1>
            <p>Answer your security question to continue</p>
          </div>
          <form onSubmit={handleSecurityVerify} className="auth-form">
            {error && <div className="auth-error">{error}</div>}
            <div className="input-group">
              <label>{securityQuestion}</label>
              <input
                type="password"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                placeholder="Enter your answer"
                autoComplete="off"
                className="privacy-input"
                data-testid="security-answer-input"
              />
              <small className="privacy-note">Answer is hidden for your privacy</small>
            </div>
            <button type="submit" className="auth-submit" disabled={loading} data-testid="security-verify-btn">
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>
            <button type="button" className="auth-back-btn" onClick={switchToLogin}>Back to Login</button>
          </form>
        </div>
      </div>
    );
  }

  // Email Verification Screen
  if (mode === 'verify-email') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Verify Email</h1>
            <p>Enter the verification code sent to <strong>{email}</strong></p>
          </div>
          <div className="auth-form">
            {error && <div className="auth-error">{error}</div>}
            
            {!codeSent ? (
              <div className="code-sending">
                <div className="spinner-small"></div>
                <p>Sending verification code...</p>
              </div>
            ) : !codeVerified ? (
              <>
                {emailSent ? (
                  <div className="code-display">
                    <p>A verification code has been sent to your email.</p>
                    <small>Check your inbox (and spam folder)</small>
                  </div>
                ) : sentCode ? (
                  <div className="code-display">
                    <p>Your verification code:</p>
                    <div className="code-box">{sentCode}</div>
                    <small>Enter this code below to verify your email</small>
                  </div>
                ) : null}
                <div className="input-group">
                  <label>Verification Code</label>
                  <input
                    type="text"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                    data-testid="verification-code-input"
                  />
                </div>
                <button className="auth-submit" onClick={handleVerifyCode} disabled={loading} data-testid="verify-code-btn">
                  Verify Code
                </button>
              </>
            ) : (
              <>
                <div className="code-verified">
                  <span className="check-icon">&#10003;</span>
                  <p>Email verified successfully!</p>
                </div>
                <button className="auth-submit" onClick={handleCompleteRegistration} disabled={loading} data-testid="complete-register-btn">
                  {loading ? 'Creating Account...' : 'Complete Registration'}
                </button>
              </>
            )}
            
            <button type="button" className="auth-back-btn" onClick={switchToRegister}>Back</button>
          </div>
        </div>
      </div>
    );
  }

  // Login / Register
  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1>Killswitch</h1>
          <p>Secure proxy browser</p>
        </div>

        <div className="auth-tabs">
          <button 
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={switchToLogin}
          >
            Login
          </button>
          <button 
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={switchToRegister}
          >
            Register
          </button>
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleRegisterSubmit} className="auth-form">
          {error && <div className="auth-error">{error}</div>}
          
          <div className="input-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              data-testid="username-input"
            />
          </div>

          {mode === 'register' && (
            <div className="input-group">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                autoComplete="email"
                data-testid="email-input"
              />
            </div>
          )}

          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete={mode === 'login' ? "current-password" : "new-password"}
              data-testid="password-input"
            />
          </div>

          {mode === 'register' && (
            <div className="input-group">
              <label>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
                data-testid="confirm-password-input"
              />
            </div>
          )}

          <button 
            type="submit" 
            className="auth-submit"
            disabled={loading}
            data-testid="auth-submit-btn"
          >
            {loading ? 'Please wait...' : (mode === 'login' ? 'Login' : 'Continue')}
          </button>
        </form>

        <div className="auth-footer">
          {mode === 'login' ? (
            <p>Don't have an account? <button onClick={switchToRegister}>Register</button></p>
          ) : (
            <p>Already have an account? <button onClick={switchToLogin}>Login</button></p>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
