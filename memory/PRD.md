# CreaoBrowser PRD

## Original Problem Statement
User wanted to fix CreaoBrowser so that:
1. Search doesn't redirect to a new tab
2. Clicking links doesn't cause a black screen

## What's Been Implemented (Jan 2026)
- **CreaoBrowser**: A proxy-based web browser built in React
- **Search Feature**: Uses SearXNG APIs with DuckDuckGo fallback
- **Tab Management**: Multiple tabs, close tabs, switch tabs
- **Navigation**: Back, forward, refresh, home buttons
- **Bookmarks Bar**: Quick links to popular sites
- **Link Interception**: All links clicked within iframes are intercepted and loaded through the proxy system

## Bug Fixes Applied
1. **Search Redirect Fix**: Search results now display in an iframe within the current tab instead of opening a new browser tab
2. **Black Screen Fix**: 
   - Removed `target="_blank"` from injected base tags
   - Added link interceptor script that captures all link clicks
   - Resolves relative URLs to absolute URLs before loading
   - Shows proper error pages when proxy fails
   - Added loading page for better UX during content fetch

## Architecture
- Frontend: React.js with useState/useCallback hooks
- Proxy System: Multiple CORS proxies (allorigins, corsproxy.io, codetabs, thingproxy)
- Content Loading: Blob URLs for iframe content
- Communication: postMessage API between iframe and parent

## Known Limitations
- Many popular sites block proxy access (Wikipedia, Google, YouTube)
- SearXNG APIs may fail due to CORS (falls back to DuckDuckGo)
- DuckDuckGo lite version may have server issues

## P0 Features (Complete)
- [x] Tab management
- [x] Address bar navigation
- [x] Search functionality
- [x] Link interception and same-tab loading
- [x] Error handling

## P1 Features (Backlog)
- [ ] Browser history persistence
- [ ] Bookmark management
- [ ] Settings/preferences

## P2 Features (Future)
- [ ] Download manager
- [ ] More reliable proxy options
- [ ] Ad blocking
