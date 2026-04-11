import React, { useState, useRef, useCallback, useEffect } from 'react';
import './App.css';

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

const QL = [
  { icon: '🔍', label: 'Google', url: 'https://www.google.com' },
  { icon: '▶️', label: 'YouTube', url: 'https://www.youtube.com' },
  { icon: '🐙', label: 'GitHub', url: 'https://github.com' },
  { icon: '📖', label: 'Wikipedia', url: 'https://en.wikipedia.org' },
  { icon: '🟠', label: 'Reddit', url: 'https://www.reddit.com' },
  { icon: '📰', label: 'HN', url: 'https://news.ycombinator.com' },
];

const fetchT = (url, ms) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(t));
};

const escapeHtml = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function App() {
  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [addressBarValue, setAddressBarValue] = useState('');
  const [statusText, setStatusText] = useState('Ready');
  const [showBookmarks, setShowBookmarks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Fetching via proxy…');
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  const tabCounterRef = useRef(0);
  const blobURLsRef = useRef({});
  const loadingIntervalRef = useRef(null);
  const iframeRefs = useRef({});

  // Initialize first tab
  useEffect(() => {
    if (tabs.length === 0) {
      addTab();
    }
  }, []);

  const getTab = useCallback((id) => tabs.find(t => t.id === id), [tabs]);

  const updateTab = useCallback((id, updates) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

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
      loadURL('https://www.google.com/search?q=' + encodeURIComponent(query), currentTabId);
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

    let html = null;
    setLoadingText('Racing proxies for fastest response…');

    try {
      html = await Promise.any(
        PROXIES.map(px =>
          fetchT(px(url), 8000).then(async r => {
            if (!r.ok) throw new Error('bad status');
            const t = await r.text();
            if (!t || t.length < 200) throw new Error('empty');
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
          blobUrl: null, // Clear blobUrl so error page shows
          errorMsg: `Could not load "${url}". The site may block proxy access, or you may be offline.`,
        } : t
      ));
      setStatusText('Failed');
      return;
    }

    // Inject base tag for relative URLs (without target="_blank")
    if (!/]*>/i.test(html)) {
      const base = `<base href="${url}">`;
      html = html.replace(/(<head[^>]*>)/i, '$1' + base);
      if (!html.includes('<base')) html = base + html;
    }

    // Inject link interceptor script to handle clicks within iframe
    // We need to store the original URL for resolving relative links
    const linkInterceptor = `
      <script>
        (function() {
          var originalBaseUrl = '${url}';
          
          function resolveUrl(href) {
            // If it's already absolute, return as is
            if (href.startsWith('http://') || href.startsWith('https://')) {
              return href;
            }
            // If it starts with //, prepend https:
            if (href.startsWith('//')) {
              return 'https:' + href;
            }
            // Use URL API to resolve relative URL
            try {
              return new URL(href, originalBaseUrl).href;
            } catch(e) {
              return originalBaseUrl;
            }
          }
          
          document.addEventListener('click', function(e) {
            var target = e.target;
            while (target && target.tagName !== 'A') {
              target = target.parentElement;
            }
            if (target) {
              var href = target.getAttribute('href');
              if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
                return;
              }
              e.preventDefault();
              e.stopPropagation();
              var absoluteUrl = resolveUrl(href);
              window.parent.postMessage({type: 'loadURL', url: absoluteUrl}, '*');
            }
          }, true);
          
          // Also handle form submissions
          document.addEventListener('submit', function(e) {
            var form = e.target;
            var action = form.getAttribute('action') || originalBaseUrl;
            e.preventDefault();
            var formData = new FormData(form);
            var params = new URLSearchParams(formData).toString();
            var absoluteAction = resolveUrl(action);
            var separator = absoluteAction.includes('?') ? '&' : '?';
            var url = absoluteAction + separator + params;
            window.parent.postMessage({type: 'loadURL', url: url}, '*');
          }, true);
        })();
      </script>
    `;
    
    // Inject before closing body or at end
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
  }, [activeTabId, doSearch, startLoading, stopLoading]);

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

  const activeTab = getTab(activeTabId);
  const canGoBack = activeTab && activeTab.historyIdx > 0;
  const canGoForward = activeTab && activeTab.historyIdx < activeTab.history.length - 1;

  return (
    <div className="browser-container">
      {/* Title Bar */}
      <div className="title-bar">
        <div className="window-controls">
          <div className="dot close"></div>
          <div className="dot min"></div>
          <div className="dot max"></div>
        </div>
        <span style={{ marginLeft: 8, fontSize: 13, color: '#9aa0a6' }}>🌐 CreaoBrowser</span>
        <span className="proxy-badge">🔀 Proxy Mode</span>
      </div>

      {/* Tab Bar */}
      <div className="tab-bar" data-testid="tab-bar">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
            onClick={() => switchTab(tab.id)}
            data-testid={`tab-${tab.id}`}
          >
            <span>🌐</span>
            <span className="tab-title">{tab.title}</span>
            <button className="close-tab" onClick={(e) => closeTab(e, tab.id)} data-testid={`close-tab-${tab.id}`}>✕</button>
          </div>
        ))}
        <button className="new-tab-btn" onClick={() => addTab()} data-testid="new-tab-btn">+</button>
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <button className="nav-btn" onClick={goBack} disabled={!canGoBack} data-testid="back-btn">←</button>
        <button className="nav-btn" onClick={goForward} disabled={!canGoForward} data-testid="forward-btn">→</button>
        <button className="nav-btn" onClick={refresh} data-testid="refresh-btn">↻</button>
        <button className="nav-btn" onClick={goHome} data-testid="home-btn">🏠</button>
        <div className="address-bar-wrap">
          <span style={{ fontSize: 14, color: '#aaa' }}>🔒</span>
          <input
            className="address-bar"
            type="text"
            placeholder="Search Google or enter a URL…"
            value={addressBarValue}
            onChange={(e) => setAddressBarValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && navigate()}
            data-testid="address-bar"
          />
          <button className="go-btn" onClick={navigate} data-testid="go-btn">➤</button>
        </div>
        <button className="nav-btn" onClick={() => setShowBookmarks(!showBookmarks)} data-testid="bookmarks-toggle">⭐</button>
        <button className="nav-btn" data-testid="menu-btn">⋮</button>
      </div>

      {/* Bookmarks Bar */}
      {showBookmarks && (
        <div className="bookmarks-bar" data-testid="bookmarks-bar">
          <div className="bookmark" onClick={() => loadURL('https://www.google.com')}>🔍 Google</div>
          <div className="bookmark" onClick={() => loadURL('https://www.youtube.com')}>▶️ YouTube</div>
          <div className="bookmark" onClick={() => loadURL('https://github.com')}>🐙 GitHub</div>
          <div className="bookmark" onClick={() => loadURL('https://en.wikipedia.org')}>📖 Wikipedia</div>
          <div className="bookmark" onClick={() => loadURL('https://www.reddit.com')}>🟠 Reddit</div>
          <div className="bookmark" onClick={() => loadURL('https://news.ycombinator.com')}>📰 HN</div>
          <div className="bookmark" onClick={() => loadURL('https://www.bbc.com/news')}>📡 BBC</div>
        </div>
      )}

      {/* Content Area */}
      <div className="content-area" data-testid="content-area">
        {/* Loading Bar */}
        <div 
          className="loading-bar" 
          style={{ 
            width: `${loadingProgress}%`, 
            opacity: loading ? 1 : 0 
          }}
        ></div>

        {/* Loading Overlay */}
        <div className={`loading-overlay ${loading ? 'visible' : ''}`}>
          <div className="spinner"></div>
          <div className="loading-text">{loadingText}</div>
        </div>

        {/* Tab Contents */}
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          const showNewTab = isActive && !tab.url && !tab.showError && !loading;
          const showError = isActive && tab.showError && !loading;
          // Show frame if we have a blobUrl, even while loading (keeps previous content visible)
          const showFrame = isActive && tab.blobUrl && !tab.showError;
          
          return (
            <React.Fragment key={tab.id}>
              {/* New Tab Page */}
              {showNewTab && (
                <div className="new-tab-page active" data-testid={`ntp-${tab.id}`}>
                  <h1>🌐 CreaoBrowser</h1>
                  <div className="search-box-wrap">
                    <span style={{ fontSize: 18, color: '#9aa0a6' }}>🔍</span>
                    <input
                      className="search-box"
                      placeholder="Search the web…"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const query = e.target.value.trim();
                          if (query) {
                            doSearch(query);
                          }
                        }
                      }}
                      data-testid={`ntp-search-${tab.id}`}
                    />
                  </div>
                  <div className="quick-links">
                    {QL.map((q, i) => (
                      <div key={i} className="quick-link" onClick={() => loadURL(q.url)}>
                        <div className="ql-icon">{q.icon}</div>
                        <span>{q.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Page */}
              {showError && (
                <div className="error-page active" data-testid={`error-${tab.id}`}>
                  <div style={{ fontSize: 60 }}>😵</div>
                  <h2>Page couldn't load</h2>
                  <p>{tab.errorMsg || 'All proxy attempts failed.'}</p>
                  <button className="retry-btn" onClick={() => retryLoad(tab.id)} data-testid={`retry-${tab.id}`}>Try Again</button>
                </div>
              )}

              {/* Browser Frame - show if we have content, keeps visible while loading new content */}
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

              {/* Loading state when we don't have content yet */}
              {isActive && loading && !tab.blobUrl && !tab.showError && (
                <div className="loading-page active">
                  <div className="spinner large"></div>
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
        <span>CreaoBrowser v2.0 · Proxy Mode</span>
      </div>
    </div>
  );
}

export default App;
