# Deploy DALI Backend

## Option 1: Render (Recommended — Free Tier)

### Step 1: Push to GitHub
```bash
cd dali-backend
git init
git add .
git commit -m "Initial commit"
# Create repo on GitHub, then:
git remote add origin https://github.com/YOURNAME/dali-backend.git
git push -u origin main
```

### Step 2: Create Web Service on Render
1. Go to [render.com](https://render.com) → New → Web Service
2. Connect your GitHub repo
3. Settings:
   - **Name:** `dali-backend`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Add Environment Variables:
   - `JWT_SECRET` → generate a random string (e.g., `openssl rand -base64 32`)
   - `FRONTEND_URL` → your frontend URL (e.g., `https://dali-app.vercel.app`)
   - `NODE_ENV` → `production`
5. Click **Create Web Service**

Render gives you a free URL like `https://dali-backend.onrender.com`

---

## Option 2: Railway

1. Go to [railway.app](https://railway.app)
2. New Project → Deploy from GitHub repo
3. Add variables:
   - `JWT_SECRET`
   - `FRONTEND_URL`
   - `PORT` (Railway sets this automatically)
4. Deploy

---

## After Deployment

Update your frontend's `REACT_APP_API_URL` to match your backend URL:
```
REACT_APP_API_URL=https://dali-backend.onrender.com
```

Then redeploy the frontend.
