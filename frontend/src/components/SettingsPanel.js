import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import './SettingsPanel.css';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const TAB_CLOAKS = [
  { title: 'Google Docs', icon: 'https://ssl.gstatic.com/docs/documents/images/kix-favicon7.ico' },
  { title: 'Google Drive', icon: 'https://ssl.gstatic.com/images/branding/product/2x/drive_2020q4_48dp.png' },
  { title: 'Canvas', icon: 'https://du11hjcvx0uqb.cloudfront.net/dist/images/favicon-e10d657a73.ico' },
  { title: 'Clever', icon: 'https://assets.clever.com/resource-icons/apps/clever-favicon.ico' },
  { title: 'Schoology', icon: 'https://app.schoology.com/sites/all/themes/flavor_app/favicon.ico' },
  { title: 'Gmail', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico' },
  { title: 'Google Classroom', icon: 'https://ssl.gstatic.com/classroom/favicon.png' },
  { title: 'Wikipedia', icon: 'https://en.wikipedia.org/static/favicon/wikipedia.ico' },
  { title: 'None (Default)', icon: '' },
];

const ANIMATED_GRADIENTS = [
  { name: 'Ocean', value: 'linear-gradient(-45deg, #0f0c29, #302b63, #24243e, #0f0c29)' },
  { name: 'Sunset', value: 'linear-gradient(-45deg, #ee7752, #e73c7e, #23a6d5, #23d5ab)' },
  { name: 'Northern Lights', value: 'linear-gradient(-45deg, #0a0e27, #1a237e, #00695c, #0a0e27)' },
  { name: 'Neon', value: 'linear-gradient(-45deg, #ff006e, #8338ec, #3a86ff, #ff006e)' },
  { name: 'Midnight', value: 'linear-gradient(-45deg, #020024, #090979, #00d4ff, #020024)' },
  { name: 'Lava', value: 'linear-gradient(-45deg, #1a0000, #8b0000, #ff4500, #1a0000)' },
];

const SOLID_COLORS = [
  '#202124', '#1a1a2e', '#0d1b2a', '#1b2838', '#0a192f',
  '#2d1b69', '#1a0000', '#0b3d0b', '#3c1361', '#1c1c1c',
  '#2c3e50', '#34495e', '#2c2c54', '#1e272e', '#0f3443',
];

const SettingsPanel = ({ onClose, settings, onSettingsChange }) => {
  const [activeTab, setActiveTab] = useState('backgrounds');
  const [history, setHistory] = useState([]);
  const [localSettings, setLocalSettings] = useState(settings || {});
  const [saving, setSaving] = useState(false);
  const [customColor, setCustomColor] = useState(settings?.background_value || '#202124');
  const fileInputRef = useRef(null);

  useEffect(() => {
    setLocalSettings(settings || {});
  }, [settings]);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab]);

  const loadHistory = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/api/history`);
      setHistory(data.reverse());
    } catch {}
  };

  const clearHistory = async () => {
    try {
      await axios.delete(`${API_URL}/api/history`);
      setHistory([]);
    } catch {}
  };

  const saveSettings = async (updates) => {
    setSaving(true);
    try {
      const { data } = await axios.put(`${API_URL}/api/settings`, updates);
      setLocalSettings(data);
      onSettingsChange(data);
    } catch {}
    setSaving(false);
  };

  const setBackground = (type, value) => {
    saveSettings({ background_type: type, background_value: value });
  };

  const setTabCloak = (title, icon) => {
    saveSettings({ tab_cloak_title: title, tab_cloak_icon: icon });
    // Apply immediately
    document.title = title || 'CreaoBrowser';
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    link.type = 'image/x-icon';
    link.rel = 'shortcut icon';
    link.href = icon || '/favicon.ico';
    document.head.appendChild(link);
  };

  const handleCustomImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setBackground('custom', ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="settings-overlay" data-testid="settings-panel">
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose} data-testid="settings-close">&times;</button>
        </div>

        <div className="settings-tabs">
          <button className={activeTab === 'backgrounds' ? 'active' : ''} onClick={() => setActiveTab('backgrounds')} data-testid="bg-tab">Backgrounds</button>
          <button className={activeTab === 'cloaking' ? 'active' : ''} onClick={() => setActiveTab('cloaking')} data-testid="cloak-tab">Tab Cloaking</button>
          <button className={activeTab === 'history' ? 'active' : ''} onClick={() => setActiveTab('history')} data-testid="history-tab">History</button>
        </div>

        <div className="settings-content">
          {/* Backgrounds Tab */}
          {activeTab === 'backgrounds' && (
            <div className="bg-section">
              <h3>Solid Colors</h3>
              <div className="color-grid">
                {SOLID_COLORS.map(c => (
                  <div
                    key={c}
                    className={`color-swatch ${localSettings.background_type === 'solid' && localSettings.background_value === c ? 'selected' : ''}`}
                    style={{ background: c }}
                    onClick={() => setBackground('solid', c)}
                    data-testid={`color-${c}`}
                  />
                ))}
                <div className="color-swatch custom-color-swatch">
                  <input
                    type="color"
                    value={customColor}
                    onChange={(e) => {
                      setCustomColor(e.target.value);
                      setBackground('solid', e.target.value);
                    }}
                    data-testid="custom-color-picker"
                  />
                  <span>Custom</span>
                </div>
              </div>

              <h3>Animated Gradients</h3>
              <div className="gradient-grid">
                {ANIMATED_GRADIENTS.map(g => (
                  <div
                    key={g.name}
                    className={`gradient-swatch ${localSettings.background_type === 'animated' && localSettings.background_value === g.value ? 'selected' : ''}`}
                    style={{ background: g.value, backgroundSize: '400% 400%' }}
                    onClick={() => setBackground('animated', g.value)}
                    data-testid={`gradient-${g.name}`}
                  >
                    <span>{g.name}</span>
                  </div>
                ))}
              </div>

              <h3>Custom Image</h3>
              <div className="custom-bg-section">
                <button className="upload-btn" onClick={() => fileInputRef.current?.click()} data-testid="upload-bg-btn">
                  Upload Image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleCustomImage}
                />
                <button className="reset-btn" onClick={() => setBackground('solid', '#202124')} data-testid="reset-bg-btn">
                  Reset to Default
                </button>
              </div>
            </div>
          )}

          {/* Tab Cloaking */}
          {activeTab === 'cloaking' && (
            <div className="cloak-section">
              <p className="cloak-desc">Disguise your browser tab to look like a different website.</p>
              <div className="cloak-grid">
                {TAB_CLOAKS.map(c => (
                  <div
                    key={c.title}
                    className={`cloak-option ${localSettings.tab_cloak_title === c.title ? 'selected' : ''}`}
                    onClick={() => setTabCloak(c.title === 'None (Default)' ? '' : c.title, c.icon)}
                    data-testid={`cloak-${c.title}`}
                  >
                    {c.icon ? (
                      <img src={c.icon} alt="" className="cloak-icon" onError={(e) => e.target.style.display='none'} />
                    ) : (
                      <span className="cloak-icon-placeholder">🌐</span>
                    )}
                    <span>{c.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {activeTab === 'history' && (
            <div className="history-section">
              <div className="history-header">
                <span>{history.length} entries</span>
                <button className="clear-history-btn" onClick={clearHistory} data-testid="clear-history-btn">
                  Clear All History
                </button>
              </div>
              {history.length === 0 ? (
                <div className="history-empty">No browsing history yet.</div>
              ) : (
                <div className="history-list">
                  {history.map((h, i) => (
                    <div key={i} className="history-item" onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('loadurl', { detail: h.url })); }}>
                      <div className="history-title">{h.title || h.url}</div>
                      <div className="history-url">{h.url}</div>
                      <div className="history-time">{h.visited_at ? new Date(h.visited_at).toLocaleString() : ''}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
