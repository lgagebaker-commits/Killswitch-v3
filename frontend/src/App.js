import React, { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthPage from './components/AuthPage';
import AdminPanel from './components/AdminPanel';
import SettingsPanel from './components/SettingsPanel';
import axios from 'axios';
import { ArrowLeft, ArrowRight, RotateCw, Home, Search, Shield, Settings, User, LayoutDashboard, Bookmark, BookmarkPlus, Plus, X, Globe, AlertTriangle, LogOut, Loader2 } from 'lucide-react';
import { FaGoogle, FaYoutube, FaGithub, FaWikipediaW, FaReddit, FaHackerNews } from 'react-icons/fa';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const PROXIES = [
  u => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  u => 'https://corsproxy.io/?' + encodeURIComponent(u),
  u => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  u => 'https://thingproxy.freeboard.io/fetch/' + u,
  u => 'https://cors-anywhere.herokuapp.com/' + u,
  u => 'https://crossorigin.me/' + u,
];

const SEARX = [
  'https://searx.be',
  'https://paulgo.io',
  'https://searxng.site',
  'https://search.mdosch.de',
  'https://searx.tiekoetter.com',
];

const fetchT = (url, ms) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
};

const escapeHtml = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function Browser() {
  const { user, logout } = useAuth();
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [addressBarValue, setAddressBarValue] = useState('');
  const [statusText, setStatusText] = useState('Ready');
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Fetching via proxy…');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [userBookmarks, setUserBookmarks] = useState([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [userSettings, setUserSettings] = useState({});
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [clock, setClock] = useState('');
  const [bgStyle, setBgStyle] = useState({});
  
  const tabCounterRef = useRef(0);
  const blobURLsRef = useRef({});
  const loadingIntervalRef = useRef(null);
  const iframeRefs = useRef({});

  // Load user data on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const [bookmarksRes, settingsRes] = await Promise.all([
          axios.get(`${API_URL}/api/bookmarks`, { withCredentials: true }),
          axios.get(`${API_URL}/api/settings`, { withCredentials: true })
        ]);
        setUserBookmarks(bookmarksRes.data);
        setUserSettings(settingsRes.data);
        setShowBookmarks(settingsRes.data.show_bookmarks_bar !== false);
      } catch (err) {
        console.error('Failed to load user data:', err);
      }
    };
    loadUserData();
  }, []);

  // Clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes().toString().padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      setClock(`${h12}:${m} ${ampm}`);
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  // Apply tab cloaking from settings
  useEffect(() => {
    if (userSettings.tab_cloak_title) {
      document.title = userSettings.tab_cloak_title;
    }
    if (userSettings.tab_cloak_icon) {
      let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
      link.type = 'image/x-icon';
      link.rel = 'shortcut icon';
      link.href = userSettings.tab_cloak_icon;
      document.head.appendChild(link);
    }
  }, [userSettings]);

  // Apply background from settings
  useEffect(() => {
    const type = userSettings.background_type;
    const value = userSettings.background_value;
    if (type === 'solid') {
      setBgStyle({ background: value });
    } else if (type === 'animated') {
      setBgStyle({ background: value, backgroundSize: '400% 400%', animation: 'bgMove 8s ease infinite' });
    } else if (type === 'custom') {
      setBgStyle({ backgroundImage: `url(${value})`, backgroundSize: 'cover', backgroundPosition: 'center' });
    } else {
      setBgStyle({});
    }
  }, [userSettings]);

  const handleSettingsChange = (newSettings) => {
    setUserSettings(newSettings);
    setShowBookmarks(newSettings.show_bookmarks_bar !== false);
  };

  // Listen for loadurl events from settings history
  useEffect(() => {
    const handler = (e) => { if (e.detail) loadURL(e.detail); };
    window.addEventListener('loadurl', handler);
    return () => window.removeEventListener('loadurl', handler);
  }, []);

  // Initialize first tab
  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, []);

  // Save history when visiting pages
  const saveToHistory = useCallback(async (url, title) => {
    try {
      await axios.post(`${API_URL}/api/history`, { url, title }, { withCredentials: true });
    } catch (err) {
      console.error('Failed to save history:', err);
    }
  }, []);

  const getTab = useCallback((id) => tabs.find(t => t.id === id), [tabs]);

  const addTab = useCallback((url = null) => {
    const id = ++tabCounterRef.current;
    const newTab = {
      id,
      title: 'New Tab',
      url: '',
      history: [],
      historyIdx: -1,
      showError: false,
      errorMsg: '',
      blobUrl: null,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
    setAddressBarValue('');
    if (url) {
      setTimeout(() => loadURL(url, id), 0);
    }
  }, []);

  const switchTab = useCallback((id) => {
    setActiveTabId(id);
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      setAddressBarValue(tab.url.startsWith('search:') ? tab.url.replace('search:', '') : tab.url);
    }
  }, [tabs]);

  const closeTab = useCallback((e, id) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      addTab();
    }
    setTabs(prev => prev.filter(t => t.id !== id));
    if (blobURLsRef.current[id]) {
      URL.revokeObjectURL(blobURLsRef.current[id]);
      delete blobURLsRef.current[id];
    }
    if (activeTabId === id) {
      const remaining = tabs.filter(t => t.id !== id);
      if (remaining.length > 0) {
        setActiveTabId(remaining[remaining.length - 1].id);
      }
    }
  }, [tabs, activeTabId, addTab]);

  const startLoading = useCallback(() => {
    setLoading(true);
    setLoadingProgress(0);
    clearInterval(loadingIntervalRef.current);
    let p = 0;
    loadingIntervalRef.current = setInterval(() => {
      p = Math.min(p + Math.random() * 12, 85);
      setLoadingProgress(p);
    }, 300);
  }, []);

  const stopLoading = useCallback(() => {
    clearInterval(loadingIntervalRef.current);
    setLoadingProgress(100);
    setTimeout(() => {
      setLoading(false);
      setLoadingProgress(0);
    }, 400);
  }, []);

  const buildSearchPage = useCallback((query, results, infoboxes) => {
    const box = (infoboxes || [])[0];
    const infoHTML = box ? `
      <div class="infobox">
        ${box.img_src ? `<img src="${escapeHtml(box.img_src)}" onerror="this.style.display='none'">` : ''}
        <div class="infobox-body">
          <div class="infobox-title">${escapeHtml(box.infobox || box.id || '')}</div>
          <div class="infobox-content">${escapeHtml((box.content || '').slice(0, 400))}</div>
          ${(box.urls || []).slice(0, 2).map(u => `<a href="#" onclick="window.parent.postMessage({type:'loadURL',url:'${u.url}'},'*');return false" class="infobox-link">🔗 ${escapeHtml(u.title || u.url)}</a>`).join('')}
        </div>
      </div>` : '';

    const cards = results.slice(0, 25).map(r => {
      let domain = '';
      try { domain = new URL(r.url).hostname.replace('www.', ''); } catch { }
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
      const engines = (r.engines || []).slice(0, 3).map(e => `<span class="engine-tag">${escapeHtml(e)}</span>`).join('');
      return `<div class="result" onclick="window.parent.postMessage({type:'loadURL',url:'${r.url.replace(/'/g, "\\'")}'},'*')">
        <div class="result-meta">
          <img class="favicon" src="${favicon}" onerror="this.style.display='none'">
          <span class="result-domain">${escapeHtml(domain)}</span>
          <span class="result-url">${escapeHtml(r.url.slice(0, 70))}</span>
          <div class="engines">${engines}</div>
        </div>
        <div class="result-title">${escapeHtml((r.title || '').slice(0, 90))}</div>
        <div class="result-snippet">${escapeHtml((r.content || '').slice(0, 220))}</div>
      </div>`;
    }).join('');

    const noRes = results.length === 0 ? `<div class="no-results">😕 No results found for "<strong>${escapeHtml(query)}</strong>".<br>Try different keywords.</div>` : '';

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{font-family:'Segoe UI',sans-serif;background:#202124;color:#e8eaed;padding:0 0 40px;}
      .top-bar{background:#292a2d;padding:10px 24px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #3c4043;position:sticky;top:0;z-index:9;}
      .logo{font-size:22px;font-weight:700;color:#8ab4f8;cursor:pointer;white-space:nowrap;}
      .sbar{flex:1;display:flex;align-items:center;background:#303134;border-radius:24px;padding:0 16px;height:42px;gap:10px;border:1px solid #5f6368;max-width:680px;}
      .sbar:focus-within{border-color:#8ab4f8;}
      .sbar input{flex:1;background:none;border:none;outline:none;color:#e8eaed;font-size:15px;}
      .sbar button{background:none;border:none;color:#8ab4f8;cursor:pointer;font-size:16px;padding:4px 8px;}
      .sbar button:hover{background:#3c4043;border-radius:50%;}
      .content{max-width:740px;margin:0 auto;padding:20px 24px;}
      .stats{font-size:13px;color:#9aa0a6;margin-bottom:18px;}
      .infobox{display:flex;gap:16px;background:#303134;border-radius:12px;padding:16px;margin-bottom:20px;border-left:4px solid #8ab4f8;}
      .infobox img{width:80px;height:80px;object-fit:cover;border-radius:8px;flex-shrink:0;}
      .infobox-title{font-size:17px;font-weight:600;color:#e8eaed;margin-bottom:6px;}
      .infobox-content{font-size:14px;color:#bdc1c6;line-height:1.6;margin-bottom:8px;}
      .infobox-link{display:block;font-size:13px;color:#8ab4f8;text-decoration:none;margin-top:4px;}
      .result{padding:14px 16px;border-radius:10px;cursor:pointer;margin-bottom:2px;transition:background .12s;}
      .result:hover{background:#303134;}
      .result-meta{display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap;}
      .favicon{width:16px;height:16px;border-radius:3px;}
      .result-domain{font-size:13px;color:#bdc1c6;font-weight:500;}
      .result-url{font-size:11px;color:#5f6368;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px;}
      .engines{margin-left:auto;display:flex;gap:4px;}
      .engine-tag{font-size:10px;background:#3c4043;color:#9aa0a6;padding:2px 6px;border-radius:8px;}
      .result-title{font-size:18px;color:#8ab4f8;margin-bottom:5px;font-weight:500;line-height:1.3;}
      .result-title:hover{text-decoration:underline;}
      .result-snippet{font-size:14px;color:#bdc1c6;line-height:1.6;}
      .no-results{text-align:center;padding:60px;color:#9aa0a6;font-size:16px;line-height:2;}
      .powered{font-size:11px;color:#5f6368;text-align:center;margin-top:32px;}
    </style></head><body>
    <div class="top-bar">
      <div class="logo" onclick="window.parent.postMessage({type:'goHome'},'*')">🌐</div>
      <div class="sbar">
        <span>🔍</span>
        <input id="q" value="${escapeHtml(query)}" onkeydown="if(event.key==='Enter')window.parent.postMessage({type:'doSearch',query:this.value},'*')"/>
        <button onclick="window.parent.postMessage({type:'doSearch',query:document.getElementById('q').value},'*')">➤</button>
      </div>
    </div>
    <div class="content">
      <div class="stats">About ${results.length} results</div>
      ${infoHTML}
      ${cards}
      ${noRes}
      <div class="powered">Results via SearXNG (Google · Bing · DuckDuckGo · Brave)</div>
    </div>
  </body></html>`;
  }, []);

  const doSearch = useCallback(async (query, tabId = activeTabId) => {
    query = query.trim();
    if (!query) return;

    const currentTabId = tabId || activeTabId;
    
    setTabs(prev => prev.map(t => {
      if (t.id !== currentTabId) return t;
      const newHistory = t.history.slice(0, t.historyIdx + 1);
      newHistory.push('search:' + query);
      return {
        ...t,
        url: 'search:' + query,
        showError: false,
        history: newHistory,
        historyIdx: newHistory.length - 1,
        title: query.slice(0, 20),
      };
    }));

    setAddressBarValue(query);
    setLoadingText('Searching the web…');
    startLoading();
    setStatusText('Searching...');

    const q = encodeURIComponent(query);
    
    // Try SearXNG instances first
    try {
      const data = await Promise.any(
        SEARX.map(base =>
          fetchT(`${base}/search?q=${q}&format=json&categories=general&language=en`, 6000)
            .then(r => { if (!r.ok) throw new Error('bad'); return r.json(); })
            .then(d => { if (!d.results || d.results.length === 0) throw new Error('empty'); return d; })
        )
      );

      stopLoading();
      const html = buildSearchPage(query, data.results || [], data.infoboxes || []);
      
      if (blobURLsRef.current[currentTabId]) {
        URL.revokeObjectURL(blobURLsRef.current[currentTabId]);
      }
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      blobURLsRef.current[currentTabId] = blobUrl;

      setTabs(prev => prev.map(t => 
        t.id === currentTabId ? { ...t, blobUrl } : t
      ));
      
      setStatusText(`${data.results.length} results for: ${query}`);
    } catch {
      // SearXNG failed, try loading Google search directly through proxy
      stopLoading();
      loadURL('https://www.google.com/search?q=' + encodeURIComponent(query) + '&hl=en&lr=lang_en', currentTabId);
    }
  }, [activeTabId, buildSearchPage, startLoading, stopLoading]);

  const loadURL = useCallback(async (raw, tabId = activeTabId) => {
    let url = raw.trim();
    if (!url) return;

    const currentTabId = tabId || activeTabId;
    const isURL = /^https?:\/\//i.test(url) || (/^[\w-]+(\.[\w]{2,})+/.test(url) && !url.includes(' '));
    
    if (!isURL) {
      doSearch(url, currentTabId);
      return;
    }
    
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    let hostname = '';
    try { hostname = new URL(url).hostname.replace('www.', ''); } catch { }

    setTabs(prev => prev.map(t => {
      if (t.id !== currentTabId) return t;
      const newHistory = t.history.slice(0, t.historyIdx + 1);
      newHistory.push(url);
      return {
        ...t,
        url,
        showError: false,
        history: newHistory,
        historyIdx: newHistory.length - 1,
        title: hostname || 'Loading...',
      };
    }));

    setAddressBarValue(url);
    setLoadingText('Fetching via proxy…');
    startLoading();
    setStatusText('Connecting…');

    // Save to history
    saveToHistory(url, hostname);

    let html = null;
    setLoadingText('Racing proxies for fastest response…');

    try {
      html = await Promise.any(
        PROXIES.map(px =>
          fetchT(px(url), 12000).then(async r => {
            if (!r.ok) throw new Error('bad status');
            const t = await r.text();
            if (!t || t.length < 50) throw new Error('empty');
            return t;
          })
        )
      );
    } catch {
      html = null;
    }

    stopLoading();

    if (!html) {
      setTabs(prev => prev.map(t =>
        t.id === currentTabId ? {
          ...t,
          showError: true,
          blobUrl: null,
          errorMsg: `Could not load "${url}". The site may block proxy access, or you may be offline.`,
        } : t
      ));
      setStatusText('Failed');
      return;
    }

    // Inject base tag for relative URLs
    // Get the origin for the base tag
    let baseOrigin = url;
    try { baseOrigin = new URL(url).origin + new URL(url).pathname.replace(/\/[^/]*$/, '/'); } catch {}
    
    if (!/<base[\s>]/i.test(html)) {
      const base = `<base href="${baseOrigin}">`;
      html = html.replace(/(<head[^>]*>)/i, '$1' + base);
      if (!html.includes('<base')) html = base + html;
    }

    // Remove Content-Security-Policy meta tags that block rendering in blob URLs
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?Content-Security-Policy["']?[^>]*>/gi, '');
    
    // Remove framebusting / anti-iframe scripts that hide content or redirect
    // Pattern 1: if (top != self) { ... } or if (top !== self) { ... }
    html = html.replace(/if\s*\(\s*top\s*!==?\s*self\s*\)\s*\{[^}]*\}/gi, '');
    // Pattern 2: if (window.top !== window.self) { ... }
    html = html.replace(/if\s*\(\s*window\.top\s*!==?\s*window\.self\s*\)\s*\{[^}]*\}/gi, '');
    // Pattern 3: if (self !== top) { ... }
    html = html.replace(/if\s*\(\s*self\s*!==?\s*top\s*\)\s*\{[^}]*\}/gi, '');
    // Pattern 4: if (window !== window.top) { ... }
    html = html.replace(/if\s*\(\s*window\s*!==?\s*window\.top\s*\)\s*\{[^}]*\}/gi, '');
    // Pattern 5: if (parent !== self) or if (parent.frames.length > 0) etc
    html = html.replace(/if\s*\(\s*parent\s*!==?\s*self\s*\)\s*\{[^}]*\}/gi, '');
    // Pattern 6: top.location = or top.location.href = (standalone statements)
    html = html.replace(/top\.location\s*(?:\.href)?\s*=\s*[^;]+;/gi, '');
    // Pattern 7: Remove display:none on body specifically from framebusters
    html = html.replace(/body\s*\{\s*display\s*:\s*none\s*;?\s*\}/gi, '');
    // Pattern 8: document.write that hides body
    html = html.replace(/document\.write\s*\(\s*['"][^'"]*display\s*:\s*none[^'"]*['"]\s*\)/gi, '');
    // Pattern 9: X-Frame-Options meta
    html = html.replace(/<meta[^>]*http-equiv\s*=\s*["']?X-Frame-Options["']?[^>]*>/gi, '');

    // Inject fallback styles to prevent black/blank screens + override any display:none on body
    const fallbackStyles = `<style>html,body{background:#fff!important;color:#000!important;min-height:100%!important;display:block!important;visibility:visible!important;opacity:1!important}</style>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', fallbackStyles + '</head>');
    } else {
      html = fallbackStyles + html;
    }
    
    // Also inject a script at the very top to neutralize framebusters before they run
    const framebustKiller = `<script>
      // Override top/parent references to prevent frame detection
      try {
        if (window.self !== window.top) {
          Object.defineProperty(window, 'top', { get: function() { return window.self; } });
          Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
        }
      } catch(e) {}
      // Prevent document.write from hiding body
      var origWrite = document.write.bind(document);
      document.write = function(s) {
        if (s && typeof s === 'string' && s.indexOf('display') !== -1 && s.indexOf('none') !== -1) {
          return; // Block framebuster display:none writes
        }
        origWrite(s);
      };
    </script>`;
    
    // Inject at very beginning of head (before any other scripts)
    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + framebustKiller);
    } else if (html.includes('<head ')) {
      html = html.replace(/(<head[^>]*>)/i, '$1' + framebustKiller);
    } else {
      html = framebustKiller + html;
    }

    // Escape URL for safe JS string insertion
    const safeUrl = url.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');
    const safeOrigin = baseOrigin.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"');

    // Inject link interceptor script to handle clicks within iframe
    const linkInterceptor = `
      <script>
        (function() {
          var originalBaseUrl = '${safeUrl}';
          var baseOrigin = '${safeOrigin}';
          
          function getOrigin(u) {
            try { return new URL(u).origin; } catch(e) { return ''; }
          }
          
          function resolveUrl(href) {
            if (!href) return originalBaseUrl;
            href = href.trim();
            
            // Already absolute
            if (href.startsWith('http://') || href.startsWith('https://')) {
              return href;
            }
            // Protocol-relative
            if (href.startsWith('//')) {
              return 'https:' + href;
            }
            // Resolve relative URL against the original page URL
            try {
              return new URL(href, originalBaseUrl).href;
            } catch(e) {
              return originalBaseUrl;
            }
          }
          
          // Extract real URL from Google/search redirect links
          function extractRealUrl(href) {
            // Google redirect: /url?q=https://...
            if (href.includes('/url?') || href.includes('&url=') || href.includes('?url=')) {
              try {
                var u = new URL(href);
                var real = u.searchParams.get('q') || u.searchParams.get('url') || u.searchParams.get('u');
                if (real && (real.startsWith('http://') || real.startsWith('https://'))) {
                  return real;
                }
              } catch(e) {}
            }
            return href;
          }
          
          document.addEventListener('click', function(e) {
            var target = e.target;
            while (target && target.tagName !== 'A') {
              if (!target.parentElement) break;
              target = target.parentElement;
            }
            if (target && target.tagName === 'A') {
              var href = target.getAttribute('href');
              if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) {
                return;
              }
              if (href.startsWith('#') && href.length > 1) {
                return; // Allow anchor links
              }
              e.preventDefault();
              e.stopPropagation();
              e.stopImmediatePropagation();
              var absoluteUrl = resolveUrl(href);
              absoluteUrl = extractRealUrl(absoluteUrl);
              window.parent.postMessage({type: 'loadURL', url: absoluteUrl}, '*');
              return false;
            }
          }, true);
          
          // Intercept form submissions
          document.addEventListener('submit', function(e) {
            var form = e.target;
            var action = form.getAttribute('action') || originalBaseUrl;
            e.preventDefault();
            e.stopPropagation();
            try {
              var formData = new FormData(form);
              var params = new URLSearchParams(formData).toString();
              var absoluteAction = resolveUrl(action);
              var separator = absoluteAction.includes('?') ? '&' : '?';
              var url = absoluteAction + separator + params;
              window.parent.postMessage({type: 'loadURL', url: url}, '*');
            } catch(err) {}
            return false;
          }, true);
          
          // Intercept window.open calls
          var origOpen = window.open;
          window.open = function(url) {
            if (url) {
              var absolute = resolveUrl(url);
              absolute = extractRealUrl(absolute);
              window.parent.postMessage({type: 'loadURL', url: absolute}, '*');
            }
            return null;
          };
          
          // Intercept location changes
          var origAssign = window.location.assign;
          var origReplace = window.location.replace;
          
          // Block meta refresh redirects
          document.querySelectorAll('meta[http-equiv="refresh"]').forEach(function(m) {
            m.remove();
          });
        })();
      </script>
    `;
    
    if (html.includes('</body>')) {
      html = html.replace('</body>', linkInterceptor + '</body>');
    } else {
      html = html + linkInterceptor;
    }

    if (blobURLsRef.current[currentTabId]) {
      URL.revokeObjectURL(blobURLsRef.current[currentTabId]);
    }
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    blobURLsRef.current[currentTabId] = blobUrl;

    setTabs(prev => prev.map(t =>
      t.id === currentTabId ? { ...t, blobUrl, showError: false } : t
    ));
    setStatusText('Loaded: ' + url);
  }, [activeTabId, doSearch, startLoading, stopLoading, saveToHistory]);

  // Listen for messages from iframes
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'loadURL') {
        loadURL(event.data.url);
      } else if (event.data?.type === 'doSearch') {
        doSearch(event.data.query);
      } else if (event.data?.type === 'goHome') {
        goHome();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadURL, doSearch]);

  const navigate = useCallback(() => {
    const v = addressBarValue.trim();
    if (v) loadURL(v);
  }, [addressBarValue, loadURL]);

  const goBack = useCallback(() => {
    const tab = getTab(activeTabId);
    if (tab && tab.historyIdx > 0) {
      const newIdx = tab.historyIdx - 1;
      const url = tab.history[newIdx];
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? { ...t, historyIdx: newIdx } : t
      ));
      if (url.startsWith('search:')) {
        doSearch(url.replace('search:', ''));
      } else {
        loadURL(url);
      }
    }
  }, [activeTabId, getTab, loadURL, doSearch]);

  const goForward = useCallback(() => {
    const tab = getTab(activeTabId);
    if (tab && tab.historyIdx < tab.history.length - 1) {
      const newIdx = tab.historyIdx + 1;
      const url = tab.history[newIdx];
      setTabs(prev => prev.map(t =>
        t.id === activeTabId ? { ...t, historyIdx: newIdx } : t
      ));
      if (url.startsWith('search:')) {
        doSearch(url.replace('search:', ''));
      } else {
        loadURL(url);
      }
    }
  }, [activeTabId, getTab, loadURL, doSearch]);

  const refresh = useCallback(() => {
    const tab = getTab(activeTabId);
    if (tab?.url) {
      if (tab.url.startsWith('search:')) {
        doSearch(tab.url.replace('search:', ''));
      } else {
        loadURL(tab.url);
      }
    }
  }, [activeTabId, getTab, loadURL, doSearch]);

  const goHome = useCallback(() => {
    setTabs(prev => prev.map(t =>
      t.id === activeTabId ? { ...t, url: '', blobUrl: null, showError: false } : t
    ));
    setAddressBarValue('');
    setStatusText('Ready');
  }, [activeTabId]);

  const retryLoad = useCallback((id) => {
    const tab = getTab(id);
    if (tab?.url) {
      if (tab.url.startsWith('search:')) {
        doSearch(tab.url.replace('search:', ''));
      } else {
        loadURL(tab.url);
      }
    }
  }, [getTab, loadURL, doSearch]);

  const addBookmark = useCallback(async () => {
    const tab = getTab(activeTabId);
    if (!tab?.url || tab.url.startsWith('search:')) return;
    
    try {
      const bookmark = await axios.post(`${API_URL}/api/bookmarks`, {
        title: tab.title,
        url: tab.url,
        icon: '🔗'
      }, { withCredentials: true });
      setUserBookmarks(prev => [...prev, bookmark.data]);
      setStatusText('Bookmark added!');
    } catch (err) {
      console.error('Failed to add bookmark:', err);
    }
  }, [activeTabId, getTab]);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const activeTab = getTab(activeTabId);
  const canGoBack = activeTab && activeTab.historyIdx > 0;
  const canGoForward = activeTab && activeTab.historyIdx < activeTab.history.length - 1;

  // Quick links
  const defaultQL = [
    { icon: <FaGoogle size={22} />, label: 'Google', url: 'https://www.google.com' },
    { icon: <FaYoutube size={22} />, label: 'YouTube', url: 'https://www.youtube.com' },
    { icon: <FaGithub size={22} />, label: 'GitHub', url: 'https://github.com' },
    { icon: <FaWikipediaW size={22} />, label: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { icon: <FaReddit size={22} />, label: 'Reddit', url: 'https://www.reddit.com' },
    { icon: <FaHackerNews size={22} />, label: 'HN', url: 'https://news.ycombinator.com' },
  ];

  return (
    <div className="browser-container">
      {/* Title Bar */}
      <div className="title-bar">
        <div className="window-controls">
          <div className="dot close"></div>
          <div className="dot min"></div>
          <div className="dot max"></div>
        </div>
        <div className="title-brand">
          <Shield size={14} />
          <span>Killswitch</span>
        </div>
        <span className="proxy-badge"><Shield size={10} /> Proxy</span>
        
        {/* User Menu */}
        <div className="user-menu-container">
          {user?.role === 'owner' && (
            <button 
              className="admin-panel-btn" 
              onClick={() => setShowAdminPanel(true)}
              data-testid="admin-panel-btn"
            >
              <LayoutDashboard size={14} /> Admin
            </button>
          )}
          <button 
            className="user-menu-btn" 
            onClick={() => setShowUserMenu(!showUserMenu)}
            data-testid="user-menu-btn"
          >
            <User size={14} /> {user?.username}
            {user?.role === 'owner' && <span className="owner-tag">OWNER</span>}
          </button>
          {showUserMenu && (
            <div className="user-menu-dropdown">
              <div className="user-menu-header">
                <User size={20} />
                <div>
                  <strong>{user?.username}</strong>
                  <small>{user?.role === 'owner' ? 'Owner' : user?.role}</small>
                </div>
              </div>
              <div className="user-menu-divider"></div>
              {user?.role === 'owner' && (
                <button onClick={() => { setShowAdminPanel(true); setShowUserMenu(false); }} data-testid="open-admin-btn">
                  <LayoutDashboard size={14} /> Admin Panel
                </button>
              )}
              <button onClick={handleLogout} data-testid="logout-btn">
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Admin Panel */}
      {showAdminPanel && user?.role === 'owner' && (
        <AdminPanel onClose={() => setShowAdminPanel(false)} />
      )}

      {/* Settings Panel */}
      {showSettingsPanel && (
        <SettingsPanel 
          onClose={() => setShowSettingsPanel(false)} 
          settings={userSettings}
          onSettingsChange={handleSettingsChange}
        />
      )}

      {/* Tab Bar */}
      <div className="tab-bar" data-testid="tab-bar">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => switchTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            <Globe size={13} className="tab-icon" />
            <span className="tab-title">{tab.title}</span>
            <button className="close-tab" onClick={(e) => closeTab(e, tab.id)} data-testid={`close-tab-${tab.id}`}><X size={13} /></button>
          </div>
        ))}
        <button className="new-tab-btn" onClick={() => addTab()} data-testid="new-tab-btn"><Plus size={16} /></button>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <button className="nav-btn" onClick={goBack} disabled={!canGoBack} data-testid="back-btn"><ArrowLeft size={18} /></button>
        <button className="nav-btn" onClick={goForward} disabled={!canGoForward} data-testid="forward-btn"><ArrowRight size={18} /></button>
        <button className="nav-btn" onClick={refresh} data-testid="refresh-btn"><RotateCw size={16} /></button>
        <button className="nav-btn" onClick={goHome} data-testid="home-btn"><Home size={17} /></button>
        <div className="address-bar-wrap">
          <Shield size={14} className="address-icon" />
          <input
            className="address-bar"
            type="text"
            placeholder="Search or enter URL…"
            value={addressBarValue}
            onChange={(e) => setAddressBarValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && navigate()}
            data-testid="address-bar"
          />
          <button className="go-btn" onClick={navigate} data-testid="go-btn"><Search size={15} /></button>
        </div>
        <button className="nav-btn" onClick={addBookmark} title="Add Bookmark" data-testid="add-bookmark-btn"><BookmarkPlus size={17} /></button>
        <button className="nav-btn" onClick={() => setShowBookmarks(!showBookmarks)} data-testid="bookmarks-toggle"><Bookmark size={16} /></button>
        <button className="nav-btn" onClick={() => setShowSettingsPanel(true)} data-testid="settings-btn"><Settings size={16} /></button>
      </div>

      {/* Bookmarks Bar */}
      {showBookmarks && (
        <div className="bookmarks-bar" data-testid="bookmarks-bar">
          <div className="bookmark" onClick={() => loadURL('https://www.google.com')}><FaGoogle size={12} /> Google</div>
          <div className="bookmark" onClick={() => loadURL('https://www.youtube.com')}><FaYoutube size={12} /> YouTube</div>
          <div className="bookmark" onClick={() => loadURL('https://github.com')}><FaGithub size={12} /> GitHub</div>
          <div className="bookmark" onClick={() => loadURL('https://en.wikipedia.org')}><FaWikipediaW size={12} /> Wikipedia</div>
          <div className="bookmark" onClick={() => loadURL('https://www.reddit.com')}><FaReddit size={12} /> Reddit</div>
          <div className="bookmark" onClick={() => loadURL('https://news.ycombinator.com')}><FaHackerNews size={12} /> HN</div>
          {userBookmarks.map(bm => (
            <div key={bm.id} className="bookmark user-bookmark" onClick={() => loadURL(bm.url)}>
              <Bookmark size={12} /> {bm.title}
            </div>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div className="content-area" data-testid="content-area">
        <div className="loading-bar" style={{ width: `${loadingProgress}%`, opacity: loading ? 1 : 0 }}></div>
        <div className={`loading-overlay ${loading ? 'visible' : ''}`}>
          <Loader2 size={40} className="spin-icon" />
          <div className="loading-text">{loadingText}</div>
        </div>

        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const showNewTab = isActive && !tab.url && !tab.showError && !loading;
          const showError = isActive && tab.showError && !loading;
          const showFrame = isActive && tab.blobUrl && !tab.showError;
          
          return (
            <React.Fragment key={tab.id}>
              {showNewTab && (
                <div className="new-tab-page active" style={bgStyle} data-testid={`ntp-${tab.id}`}>
                  <div className="ntp-clock" data-testid="clock">{clock}</div>
                  <div className="ntp-logo">
                    <Shield size={36} />
                    <h1>Killswitch</h1>
                  </div>
                  <p className="welcome-text">Welcome, {user?.username}</p>
                  <div className="search-box-wrap">
                    <Search size={18} className="search-icon" />
                    <input
                      className="search-box"
                      placeholder="Search the web…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const query = e.target.value.trim();
                          if (query) doSearch(query);
                        }
                      }}
                      data-testid={`ntp-search-${tab.id}`}
                    />
                  </div>
                  <div className="quick-links">
                    {defaultQL.map((q, i) => (
                      <div key={i} className="quick-link" onClick={() => loadURL(q.url)} data-testid={`quick-link-${q.label.toLowerCase()}`}>
                        <div className="ql-icon">{q.icon}</div>
                        <span>{q.label}</span>
                      </div>
                    ))}
                  </div>
                  {userBookmarks.length > 0 && (
                    <>
                      <h3 className="bookmarks-title">Your Bookmarks</h3>
                      <div className="quick-links">
                        {userBookmarks.slice(0, 6).map((bm) => (
                          <div key={bm.id} className="quick-link" onClick={() => loadURL(bm.url)}>
                            <div className="ql-icon"><Bookmark size={20} /></div>
                            <span>{bm.title.slice(0, 10)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {showError && (
                <div className="error-page active" data-testid={`error-${tab.id}`}>
                  <AlertTriangle size={56} className="error-icon" />
                  <h2>Page couldn't load</h2>
                  <p>{tab.errorMsg || 'All proxy attempts failed.'}</p>
                  <button className="retry-btn" onClick={() => retryLoad(tab.id)} data-testid={`retry-${tab.id}`}>Try Again</button>
                </div>
              )}

              {showFrame && (
                <iframe
                  ref={el => iframeRefs.current[tab.id] = el}
                  className="browser-frame active"
                  src={tab.blobUrl}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  title={`Browser frame ${tab.id}`}
                  data-testid={`frame-${tab.id}`}
                />
              )}

              {isActive && loading && !tab.blobUrl && !tab.showError && (
                <div className="loading-page active">
                  <Loader2 size={48} className="spin-icon" />
                  <div className="loading-page-text">{loadingText}</div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Status Bar */}
      <div className="status-bar">
        <span data-testid="status-text">{statusText}</span>
        <span>Killswitch · {user?.username}{user?.role === 'owner' ? ' (Owner)' : ''}</span>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <Loader2 size={36} className="spin-icon" />
        <p>Loading Killswitch...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return <Browser />;
}

export default App;
