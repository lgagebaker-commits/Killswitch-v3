# CreaoBrowser PRD

## Original Problem Statement
Web browser app with account system. Owner account (Ghost), security verification, admin panel with user management (ban/unban/delete), email+verification code on registration.

## Architecture
- Frontend: React.js (CreaoBrowser proxy browser)
- Backend: FastAPI + MongoDB
- Auth: JWT via httpOnly cookies, bcrypt password hashing
- Proxy: Multiple CORS proxies for web browsing

## What's Been Implemented (Apr 2026)
- **CreaoBrowser**: Proxy-based web browser with tabs, bookmarks, search
- **Search**: SearXNG API with Google fallback, in-tab results (no redirect)
- **Link Interception**: All iframe link clicks stay within browser
- **Auth System**: Username/password + email + verification code registration
- **Owner Account**: Ghost (security question verification on login, privacy-masked input)
- **Owner Badge**: "Owner" tag shown next to username
- **Admin Panel**: View all users online/offline, ban/unban/delete accounts
- **Ban System**: Custom duration (minutes/hours/days), reason, force logout on ban
- **Email Verification**: 6-digit code generated on registration
- **Online Tracking**: Heartbeat every 30s, last seen timestamps

## P0 (Complete)
- [x] Owner account with security verification
- [x] Admin panel with ban/unban/delete
- [x] Email + verification code registration
- [x] Force logout on ban
- [x] Online/offline status tracking

## P1 (Backlog)
- [ ] Email service integration (SendGrid/Resend) for real verification emails
- [ ] Password reset flow
- [ ] Browser history UI page
- [ ] Saved passwords manager UI

## P2 (Future)
- [ ] Multi-device session management
- [ ] More proxy options
- [ ] Ad blocking
