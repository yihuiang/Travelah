# Travelah — Travel Discovery Platform

NLP-powered travel planning for Malaysia, built from social media place data (RedNote, TikTok, Instagram).

## Local development

```powershell
# Install dependencies
npm run install:all

# Start client (port 3000) + server (port 5000)
npm run dev
```

Copy env files:

- `server/.env` ← from `server/.env.example`
- `client/.env` ← from `client/.env.example`

## Deploy

Vercel hosts `client/`, Railway hosts `server/`, MongoDB Atlas for data, R2 for images. Set Vercel root directory to `client`.

## Update production

```powershell
git add .
git commit -m "your message"
git push
```

Vercel and Railway auto-redeploy from GitHub.
