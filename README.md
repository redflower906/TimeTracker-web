# TimeTracker Web

A web version of the TimeTracker app, built with React + Vite and deployed on Firebase Hosting.

## Quick Start (Local Development)

```bash
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to Firebase Hosting

### One-time setup

1. Install Firebase CLI (if you don't have it):

```bash
npm install -g firebase-tools
```

2. Login to Firebase:

```bash
firebase login
```

3. Edit `.firebaserc` and replace `YOUR_FIREBASE_PROJECT_ID` with your actual
   Firebase project ID (the same one your Android app uses).

### Deploy

```bash
npm run build
firebase deploy --only hosting
```

That's it! Your app will be live at:

```
https://YOUR_PROJECT_ID.web.app
```

You can also access it at `https://YOUR_PROJECT_ID.firebaseapp.com`.

## Notes

- Data is stored in the browser's localStorage (per-device, not synced)
- CSV export and JSON backup/restore work via file download
- The app is a static single-page app — no server needed
- Firebase Hosting free tier: 10 GB storage, 10 GB/month bandwidth
