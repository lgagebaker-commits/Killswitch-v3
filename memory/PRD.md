# CreaoBrowser PRD

## Original Problem Statement
Web browser with account system, owner account, admin panel, settings with custom backgrounds, tab cloaking, clock, browsing history, email verification.

## Architecture
- Frontend: React.js
- Backend: FastAPI + MongoDB
- Auth: JWT Bearer tokens + localStorage
- Email: Resend API (when key provided), fallback to on-screen code
- Proxy: Multiple CORS proxies for web browsing

## Implemented (Apr 2026)
- **CreaoBrowser**: Proxy-based browser with tabs, bookmarks, search
- **Search**: SearXNG API with Google fallback, in-tab results
- **Link Interception**: All iframe clicks stay within browser
- **Auth**: Username/password + email + verification code registration
- **Owner Account**: Ghost (security question, privacy-masked input, Owner badge)
- **Admin Panel**: View all users online/offline, ban/unban/delete accounts
- **Ban System**: Custom duration, reason, force logout on ban
- **Email Verification**: Resend integration ready, fallback code display
- **Settings Panel**: Backgrounds, Tab Cloaking, History tabs
- **Custom Backgrounds**: Solid colors (15 presets + picker), 6 animated gradients, custom image upload
- **Tab Cloaking**: 8 presets (Google Docs, Drive, Canvas, Clever, Schoology, Gmail, Classroom, Wikipedia)
- **Clock**: Live clock on new tab page (top right corner)
- **History**: Browsable history with clear all, clickable entries
- **Online Tracking**: Heartbeat every 30s

## Credentials
- Owner: Ghost / Gage2011! (security: "moms steak")
- Admin: admin / admin123

## Backlog
- [ ] Add Resend API key for real email sending
- [ ] Password reset flow
- [ ] Saved passwords manager UI
- [ ] More tab cloak presets
