# Development workflow (isolated from live)

Use **only** this folder: `C:\Recruiter Application_Dev`  
Live production: `C:\Recruiter Application` on ports **3000** / **8000** and database **`staffing_db`**.

## Ports and URLs

| Service   | Dev | Live (do not change) |
|-----------|-----|----------------------|
| Frontend  | **5000** | 3000 |
| Backend   | **8080** | 8000 |
| Database  | **Recruiter_dev** | staffing_db |

- Dev UI: http://localhost:5000  
- Dev API health: http://localhost:8080/health  
- Live health (check only): http://localhost:8000/health  

## Start dev (two terminals)

**Backend**
```powershell
cd "C:\Recruiter Application_Dev\backend"
npm run dev
```

**Frontend**
```powershell
cd "C:\Recruiter Application_Dev\Staffing_Recruitment_Frontend"
npm run dev
```

Stop each with **Ctrl+C** when finished. Do **not** run `taskkill /IM node.exe /F` (that can stop live).

## Isolation settings (dev `.env`)

- `DATABASE_URL` → `Recruiter_dev` (never `staffing_db` in this folder)
- `PORT=8080`
- `EMAIL_AUTO_INGEST_ENABLED=false` (live keeps mailbox polling)
- `REDIS_URL=redis://localhost:6379/1` (live uses `/0`)

Copy from templates if needed:
- `backend/.env.example` → `backend/.env`
- `Staffing_Recruitment_Frontend/.env.local.example` → `.env.local`

## Rules

1. Edit code only under `Recruiter Application_Dev`.
2. Never edit `C:\Recruiter Application\backend\.env` while developing.
3. Never start `npm run dev` from the live folder during user hours unless maintaining production.
4. Run only **one** dev backend at a time.
5. Test on http://localhost:5000 before copying changes to live.

## Kill only dev backend (if port stuck)

```powershell
Get-CimInstance Win32_Process -Filter "name='node.exe'" |
  Where-Object { $_.CommandLine -match 'Recruiter Application_Dev\\backend' } |
  ForEach-Object { taskkill /PID $_.ProcessId /F }
```

## Deploy to live

1. Test fully on dev.
2. Copy reviewed changes to the live folder or your release process.
3. Restart live during a planned window from `C:\Recruiter Application`.
