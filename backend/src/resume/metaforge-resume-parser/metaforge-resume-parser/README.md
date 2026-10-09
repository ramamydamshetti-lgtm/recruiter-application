# Metaforge Resume Parser API

Backend-only REST API for resume parsing. Integrate with your existing recruiter application — no UI included.

## Quick Start

```bash
npm install
cp .env.example .env   # set GEMINI_API_KEY and INTEGRATION_API_KEY
npm start
```

API base URL: `http://localhost:3001/api`

---

## Authentication

Use **one** of these from your recruiter backend:

### Option A — Service API Key (recommended)

```http
X-API-Key: your-integration-api-key
```

Set `INTEGRATION_API_KEY` in `.env`. Parses are **stateless by default** (not saved to local DB).

### Option B — JWT

```http
Authorization: Bearer <jwt-token>
```

Obtain token via `POST /api/auth/login`. Parses are **saved** to local SQLite by default.

---

## Endpoints

### Health

```
GET /api/health
```

### Parse single resume

```
POST /api/parse
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | yes | PDF, DOCX, DOC, or TXT |

Query params:
- `save=false` — return parsed data only, do not store (default for API key auth)
- `save=true` — store in local SQLite

**Example (curl):**

```bash
curl -X POST "http://localhost:3001/api/parse?save=false" \
  -H "X-API-Key: your-integration-api-key" \
  -F "file=@resume.pdf"
```

**Response:**

```json
{
  "source_file": "resume.pdf",
  "full_name": "John Doe",
  "contact": "+91 98765 43210",
  "email": "john@email.com",
  "linkedin": "linkedin.com/in/johndoe",
  "qualification": "B.Tech, CS — IIT Delhi (2018)",
  "total_experience": "7 Years 3 Months",
  "total_experience_months": 87,
  "relevant_experience": "5 Years 2 Months",
  "relevant_experience_months": 62,
  "skills": ["Python", "TensorFlow", "AWS"],
  "technology": ["Data Scientist", "Machine Learning"]
}
```

### Parse bulk resumes

```
POST /api/parse/bulk
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `files` | file[] | yes | Up to 50 files |

```bash
curl -X POST "http://localhost:3001/api/parse/bulk?save=false" \
  -H "X-API-Key: your-integration-api-key" \
  -F "files=@resume1.pdf" \
  -F "files=@resume2.pdf"
```

**Response:**

```json
{
  "count": 2,
  "results": [
    {
      "source_file": "resume1.pdf",
      "status": "done",
      "data": { "full_name": "...", "total_experience": "...", "...": "..." }
    },
    {
      "source_file": "resume2.pdf",
      "status": "error",
      "error": "Error message"
    }
  ]
}
```

### AI recruitment chat

```
POST /api/chat
Content-Type: multipart/form-data
```

| Field | Type | Description |
|-------|------|-------------|
| `messages` | JSON string | `[{"role":"user","content":"..."}]` |
| `candidateProfile` | JSON string | Optional parsed candidate object |
| `attachment` | file | Optional JD file |

### Candidates (optional local storage)

Only needed if you use `save=true`:

```
GET    /api/candidates
GET    /api/candidates/:id
DELETE /api/candidates/:id
```

---

## Integration Examples

### JavaScript / Fetch

```javascript
async function parseResume(file, apiKey) {
  const form = new FormData();
  form.append("file", file);

  const res = await fetch("http://localhost:3001/api/parse?save=false", {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });

  if (!res.ok) throw new Error((await res.json()).error);
  return res.json();
}
```

### Axios

```javascript
import axios from "axios";

const client = axios.create({
  baseURL: "http://localhost:3001/api",
  headers: { "X-API-Key": process.env.RESUME_PARSER_API_KEY },
});

export const parseResume = (file) => {
  const form = new FormData();
  form.append("file", file);
  return client.post("/parse?save=false", form);
};
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | yes | Google Gemini API key |
| `INTEGRATION_API_KEY` | recommended | Key for your recruiter app |
| `JWT_SECRET` | if using JWT | Session signing secret |
| `PORT` | no | Default `3001` |
| `CORS_ORIGIN` | no | Your app URL or `*` |
| `GEMINI_MODEL` | no | Default `gemini-2.0-flash-lite` |

---

## Supported Files

- PDF (with text extraction fallback)
- DOCX / DOC
- TXT

Max file size: 10 MB. Max bulk batch: 50 files.
