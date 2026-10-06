# Air / India

A static dashboard with a Node.js API for air-quality data, account preferences, and email updates.

## Setup

Requirements: Node.js 22.5 or newer (for built-in `node:sqlite`).

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` with your SMTP provider values and a `TOKEN_SECRET` containing at least 32 random characters. Generate one with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Set `BASE_URL` to the public HTTPS origin before deploying. In production, use HTTPS so session cookies receive the `Secure` attribute. Do not commit `.env` or the SQLite database.

Start the server:

```powershell
npm start
```

For development with automatic Node restarts:

```powershell
npm run dev
```

Run the account/API tests:

```powershell
npm test
```

Open `http://127.0.0.1:8000/`. The server creates `data/air-india.sqlite` on first start. SMTP settings are required for registration verification and email delivery. The daily digest is scheduled for 7:00 AM in `Asia/Kolkata`.

## Accounts and email

Registration requires email-update consent and a verified email address before login. Users can change their profile, city, and subscription preference from the account page, or delete their account. The `Child` profile only selects child-specific guidance; the app does not ask for a child's name or date of birth.

Account data is stored in the local SQLite database. Passwords use salted scrypt hashes; session, verification, and unsubscribe tokens are stored only as hashes. Email guidance is general information, not medical advice. Air-quality values currently come from Open-Meteo's CAMS model estimate, not direct monitor observations.

The app collects email, city, health-guidance profile, subscription preference, account timestamps, and session hashes for account operation. Handle access, retention, and deletion consistently with the Digital Personal Data Protection Act, 2023 and applicable rules. This project is not legal advice.
