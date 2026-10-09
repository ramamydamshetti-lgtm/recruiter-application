# 🔄 Business Workflow Analysis & Database Redesign

## 📊 **Current Business Process Understanding**

Based on frontend analysis, your recruitment workflow is:

### **1. Client Requirements Phase**
```
Client Request → Create Job Demand → Assign to Recruiter
```
- **Client** provides job requirements
- **System** creates "Requirement" with ID like `REQ-2026-02-19-001`
- **Requirement** includes: client info, role details, skills, location, priority
- **Assignment**: Can be auto-assigned or manually assigned to recruiters

### **2. Candidate Sourcing Phase**
```
Requirement → External Sourcing (Naukri, LinkedIn) → Manual Entry
```
- **Recruiters** search external platforms (Naukri, LinkedIn, etc.)
- **Manual entry** of candidate profiles into system
- **Candidates** linked to specific requirements

### **3. Submission Phase**
```
Candidate → Submit to Client → Client Confirmation → Email Notifications
```
- **Recruiters** submit candidates to clients
- **Client** confirms/rejects submissions
- **System** sends confirmation emails to candidates
- **Status tracking**: Submitted → Interview → Selected → Rejected

---

## 🗄️ **Current Database Issues**

### **❌ Mismatch with Business Needs**

| **Business Need** | **Current Schema** | **Problem** |
|-------------------|-------------------|--------------|
| Job Requirements | `JobPosting` | Wrong structure - missing client assignment |
| Client Management | `Company` | Missing client-specific fields |
| Requirement Assignment | Missing | No assignment tracking |
| Candidate Submissions | `Application` | Wrong structure - missing client workflow |
| External Sourcing | Missing | No tracking of source platforms |
| Client Confirmation | Missing | No client approval workflow |

---

## 🏗️ **New Database Schema Design**

### **Core Business Entities**

#### **1. Clients** (NEW)
```sql
CREATE TABLE clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  poc_name TEXT NOT NULL,           -- Point of Contact
  poc_email TEXT NOT NULL,
  poc_phone TEXT,
  industry TEXT,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE
);
```

#### **2. Requirements** (REDESIGNED)
```sql
CREATE TABLE requirements (
  id TEXT PRIMARY KEY,              -- REQ-2026-02-19-001
  client_id TEXT NOT NULL,
  client_lead_poc TEXT NOT NULL,
  client_poc TEXT,
  role_title TEXT NOT NULL,
  location TEXT NOT NULL,
  experience TEXT,
  notice_period TEXT,
  skills TEXT[],                   -- Array of skills
  technologies TEXT[],               -- Array of technologies
  priority TEXT DEFAULT 'Medium',   -- High/Medium/Low
  open_positions INTEGER,
  sla_days INTEGER DEFAULT 7,
  submitting_to TEXT,
  client_jd_id TEXT,
  status TEXT DEFAULT 'Open',     -- Open/Assigned/Submitted/Interview/Selected/Rejected/Closed
  assignment TEXT DEFAULT 'Unassigned', -- Unassigned/Assigned
  owner_id TEXT,
  assigned_by TEXT,
  assigned_recruiters TEXT[],       -- Array of recruiter IDs
  submissions_count INTEGER DEFAULT 0,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by TEXT,
  
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (owner_id) REFERENCES users(id)
);
```

#### **3. Candidates** (REDESIGNED)
```sql
CREATE TABLE candidates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  current_company TEXT,
  experience_label TEXT,             -- "4 years"
  total_experience INTEGER,            -- Years of experience
  skills TEXT[],
  technologies TEXT[],
  education TEXT[],
  preferred_location TEXT,
  notice_period TEXT,
  current_salary TEXT,
  expected_salary TEXT,
  resume_url TEXT,
  source_platform TEXT,              -- Naukri/LinkedIn/Internal/Referral
  source_platform_id TEXT,           -- External platform candidate ID
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### **4. Submissions** (NEW BUSINESS LOGIC)
```sql
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  submitted_by TEXT NOT NULL,          -- Recruiter ID
  submitted_on TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'Submitted',    -- Submitted/Interview/Selected/Rejected
  client_feedback TEXT,
  client_decision_date TIMESTAMP,
  interview_date TIMESTAMP,
  interview_location TEXT,
  interview_type TEXT,                -- Phone/Video/On-site
  selected_date TIMESTAMP,
  rejection_reason TEXT,
  email_sent BOOLEAN DEFAULT FALSE,
  email_sent_date TIMESTAMP,
  
  FOREIGN KEY (requirement_id) REFERENCES requirements(id),
  FOREIGN KEY (candidate_id) REFERENCES candidates(id),
  FOREIGN KEY (submitted_by) REFERENCES users(id)
);
```

#### **5. Requirement Assignments** (NEW)
```sql
CREATE TABLE requirement_assignments (
  id TEXT PRIMARY KEY,
  requirement_id TEXT NOT NULL,
  recruiter_id TEXT NOT NULL,
  assigned_by TEXT NOT NULL,          -- Lead/Manager who assigned
  assigned_on TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'Active',      -- Active/Revoked/Completed
  notes TEXT,
  
  FOREIGN KEY (requirement_id) REFERENCES requirements(id),
  FOREIGN KEY (recruiter_id) REFERENCES users(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id)
);
```

---

## 🔄 **Workflow Implementation**

### **Phase 1: Create Requirement**
```javascript
// API: POST /api/requirements
{
  "client_id": "client-123",
  "role_title": "Senior React Developer",
  "location": "Bangalore",
  "skills": ["React", "Node.js", "MongoDB"],
  "priority": "High",
  "open_positions": 2
}
```

### **Phase 2: Assign to Recruiter**
```javascript
// API: POST /api/requirements/:id/assign
{
  "recruiter_id": "recruiter-456",
  "assigned_by": "lead-789"
}
```

### **Phase 3: Add Candidate**
```javascript
// API: POST /api/candidates
{
  "name": "John Doe",
  "email": "john@example.com",
  "source_platform": "Naukri",
  "source_platform_id": "NK-123456",
  "skills": ["React", "TypeScript"],
  "experience_label": "5 years"
}
```

### **Phase 4: Submit Candidate**
```javascript
// API: POST /api/submissions
{
  "requirement_id": "REQ-2026-02-19-001",
  "candidate_id": "candidate-789",
  "notes": "Strong React experience"
}
```

### **Phase 5: Client Confirmation**
```javascript
// API: PUT /api/submissions/:id/status
{
  "status": "Selected",
  "client_feedback": "Excellent fit for the role",
  "interview_date": "2026-03-25T10:00:00Z"
}
```

---

## 📧 **Email Triggers**

### **1. Submission Confirmation**
- **Trigger**: When candidate submitted to client
- **Recipient**: Client
- **Content**: Candidate details, requirement info

### **2. Interview Confirmation**
- **Trigger**: When client confirms interview
- **Recipient**: Candidate
- **Content**: Interview details, preparation tips

### **3. Selection Confirmation**
- **Trigger**: When client selects candidate
- **Recipient**: Candidate
- **Content**: Offer details, next steps

### **4. Rejection Notification**
- **Trigger**: When client rejects candidate
- **Recipient**: Candidate
- **Content**: Rejection reason, feedback

---

## 🎯 **Key Improvements**

### **✅ Business Alignment**
- **Requirements** match client job demands
- **Submissions** track client approval workflow
- **Candidates** include sourcing platform tracking
- **Assignments** track recruiter responsibility

### **✅ Workflow Support**
- **External sourcing** integration points
- **Client confirmation** stages
- **Email automation** at each stage
- **Status tracking** throughout pipeline

### **✅ Data Integrity**
- **Foreign keys** maintain relationships
- **Status enums** ensure data consistency
- **Audit trails** track all changes
- **Soft deletes** preserve history

---

## 🚀 **Implementation Priority**

### **Phase 1: Core Tables** (Week 1)
1. Create `clients` table
2. Redesign `requirements` table
3. Redesign `candidates` table
4. Create `submissions` table

### **Phase 2: Assignment Logic** (Week 2)
1. Create `requirement_assignments` table
2. Implement assignment APIs
3. Build assignment workflow

### **Phase 3: Email Integration** (Week 3)
1. Implement email triggers
2. Create email templates
3. Build notification system

### **Phase 4: API Development** (Week 4)
1. Requirements CRUD APIs
2. Candidates CRUD APIs
3. Submissions workflow APIs
4. Client management APIs

---

## 📊 **Benefits of New Design**

### **🎯 Business Process Alignment**
- **Exact match** to your recruitment workflow
- **Client-centric** approach
- **External sourcing** support
- **Approval workflow** tracking

### **📈 Scalability**
- **Separate concerns** (clients, requirements, candidates, submissions)
- **Flexible status** tracking
- **Easy reporting** and analytics
- **Multi-platform** sourcing support

### **🔒 Data Quality**
- **Proper relationships** between entities
- **Status consistency** with enums
- **Audit trails** for all activities
- **Performance optimized** queries

This redesign will perfectly match your business workflow! 🎉
