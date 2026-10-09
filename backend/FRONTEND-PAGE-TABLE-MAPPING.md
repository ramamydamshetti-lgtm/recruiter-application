# 📱 Frontend Page ↔ Database Table Mapping

## 🗄️ **Complete Analysis of Frontend Pages and Database Usage**

---

## 🏠 **Homepage (Landing)**
**Route**: `/` → `app/page.tsx`
**Purpose**: Marketing landing page
**Database Tables**: None needed
**Content**: Company introduction, features, login CTA

---

## 🔐 **Authentication Pages**

### **Login Page**
**Route**: `/login` → `app/login/page.tsx`
**Purpose**: User authentication
**Database Tables**: 
- `users` - For authentication
- `sessions` - For login tokens
- `email_verifications` - For email verification

### **Signup Page**
**Route**: `/signup` → `app/signup/page.tsx`
**Purpose**: New user registration
**Database Tables**:
- `users` - Create new user accounts
- `candidate_profiles` - Auto-created for CANDIDATE role
- `recruiter_profiles` - Auto-created for RECRUITER role

### **Forgot Password Page**
**Route**: `/forgot-password` → `app/forgot-password/page.tsx`
**Purpose**: Password reset
**Database Tables**:
- `users` - Find user by email
- `email_verifications` - Reset tokens

---

## 📋 **Requirements Management**

### **Requirements Dashboard**
**Route**: `/requirements` → `app/requirements/page.tsx`
**Purpose**: Main requirements management
**Database Tables**:
- `requirements` - Core requirements data
- `clients` - Client information
- `users` - Owner/assignee details
- `requirement_assignments` - Assignment tracking

### **Create New Requirement**
**Route**: `/requirements/new` → `app/requirements/new/page.tsx`
**Purpose**: Create new job demand
**Database Tables**:
- `requirements` - Insert new requirement
- `clients` - Link to existing or create new client

### **Requirement Details**
**Route**: `/requirements/[id]` → `app/requirements/[id]/page.tsx`
**Purpose**: View/edit specific requirement
**Database Tables**:
- `requirements` - Get requirement by ID
- `clients` - Client details
- `users` - Owner information
- `submissions` - Related submissions
- `requirement_assignments` - Assignment details

### **Edit Requirement**
**Route**: `/requirements/[id]/edit` → `app/requirements/[id]/edit/page.tsx`
**Purpose**: Modify existing requirement
**Database Tables**:
- `requirements` - Update requirement data
- `clients` - Update client info if needed

### **Add Submission**
**Route**: `/requirements/[id]/add-submission` → `app/requirements/[id]/add-submission/page.tsx`
**Purpose**: Submit candidate to requirement
**Database Tables**:
- `submissions` - Create new submission
- `candidates` - Link or create candidate
- `requirements` - Update submission count

---

## 👥 **Candidates Management**

### **Candidates List**
**Route**: `/candidates` → `app/candidates/page.tsx`
**Purpose**: Browse all candidates
**Database Tables**:
- `candidates` - Candidate profiles
- `submissions` - Candidate submission history

### **Create Candidate**
**Route**: `/candidates/new` → `app/candidates/new/page.tsx`
**Purpose**: Add new candidate manually
**Database Tables**:
- `candidates` - Insert new candidate
- Link to external sourcing platforms

### **Candidate Details**
**Route**: `/candidates/[id]` → (Not found in analysis)
**Purpose**: View candidate profile
**Database Tables**:
- `candidates` - Candidate details
- `submissions` - Submission history
- `skills` - Candidate skills

---

## 📤 **Submissions Tracking**

### **All Submissions**
**Route**: `/submissions` → `app/submissions/page.tsx`
**Purpose**: Track all candidate submissions
**Database Tables**:
- `submissions` - All submission data
- `candidates` - Candidate information
- `requirements` - Requirement details
- `clients` - Client information

### **Submission Details**
**Route**: `/submissions/[id]` → `app/submissions/[id]/page.tsx`
**Purpose**: View specific submission
**Database Tables**:
- `submissions` - Submission details and status
- `candidates` - Candidate profile
- `requirements` - Requirement context
- `users` - Submitter info

---

## 👥 **My Work (Recruiter Dashboard)**
**Route**: `/my-work` → `app/my-work/page.tsx`
**Purpose**: Personal recruiter workspace
**Database Tables**:
- `requirements` - Assigned to this recruiter
- `submissions` - Made by this recruiter
- `candidates` - Submitted candidates
- `requirement_assignments` - Assignment details

### **Team Management**
**Route**: `/my-work/team` → `app/my-work/team/page.tsx`
**Purpose**: Manage recruiter team
**Database Tables**:
- `users` - Team member profiles
- `requirement_assignments` - Team assignments
- `requirements` - Team requirements

---

## 📊 **Reports & Analytics**

### **Reports Dashboard**
**Route**: `/reports` → `app/reports/page.tsx`
**Purpose**: Analytics and reporting
**Database Tables**:
- `requirements` - Requirement metrics
- `submissions` - Submission analytics
- `candidates` - Candidate statistics
- `clients` - Client performance

### **Generate Reports**
**Route**: `/reports/generate` → `app/reports/generate/page.tsx`
**Purpose**: Create custom reports
**Database Tables**:
- All tables for data aggregation
- Complex joins for analytics

---

## 🗓️ **Interviews Management**

### **Interviews Page**
**Route**: `/interviews` → `app/interviews/page.tsx`
**Purpose**: Interview scheduling and tracking
**Database Tables**:
- `submissions` - Interview details from submissions
- `candidates` - Interview candidate info
- `requirements` - Interview context
- `users` - Interviewer details

---

## 👤 **User Profiles**

### **Profile Management**
**Route**: (Found in components, not direct route)
**Purpose**: User profile editing
**Database Tables**:
- `users` - Basic user info
- `candidate_profiles` - Candidate specific data
- `recruiter_profiles` - Recruiter specific data
- `companies` - Company information

---

## ❌ **Missing Pages/Sections**

Based on your business workflow, these pages are **MISSING**:

### **1. Client Management** ❌
**Missing Routes**:
- `/clients` - Client list and management
- `/clients/new` - Add new client
- `/clients/[id]` - Client details and edit

**Database Tables Needed**:
- `clients` - Client CRUD operations

### **2. Advanced Candidate Sourcing** ❌
**Missing Features**:
- External platform integration (Naukri, LinkedIn API)
- Bulk candidate import
- Source tracking dashboard

**Database Tables Needed**:
- `candidates` - Enhanced with source platform fields
- Source platform tracking table

### **3. Email Template Management** ❌
**Missing Routes**:
- `/emails/templates` - Email template management
- `/emails/logs` - Email delivery tracking

**Database Tables Needed**:
- Email templates table
- Email delivery logs table

### **4. Advanced Analytics** ❌
**Missing Features**:
- Real-time dashboard
- Performance metrics
- Conversion funnel analysis

**Database Tables Needed**:
- Analytics aggregation tables
- Performance metrics storage

---

## 🎯 **Recommended Implementation Priority**

### **Phase 1: Critical Missing Pages** 🚨
1. **Client Management** - `/clients` CRUD pages
2. **Enhanced Candidate Sourcing** - External platform integration
3. **Email Management** - Template and delivery tracking

### **Phase 2: Enhanced Features** ⚡
1. **Advanced Analytics** - Real-time dashboards
2. **Bulk Operations** - Mass candidate import/export
3. **API Integration** - External platform APIs

### **Phase 3: Optimization** 📈
1. **Performance Optimization** - Caching and indexing
2. **Mobile Responsiveness** - Mobile-first design
3. **Accessibility** - WCAG compliance

---

## 📊 **Database Usage Summary**

| **Frontend Page** | **Primary Tables** | **Secondary Tables** | **Status** |
|-------------------|-------------------|-------------------|------------|
| Homepage | None | None | ✅ Complete |
| Login/Signup | users, sessions | email_verifications | ✅ Complete |
| Requirements | requirements, clients | users, requirement_assignments | ✅ Complete |
| Candidates | candidates | submissions | ✅ Complete |
| Submissions | submissions, candidates, requirements | users, clients | ✅ Complete |
| My Work | requirements, submissions, candidates | users, requirement_assignments | ✅ Complete |
| Reports | All tables | None | ✅ Complete |
| Interviews | submissions, candidates, requirements | users | ✅ Complete |
| **Client Management** | ❌ **MISSING** | clients, requirements | ❌ **NEEDS IMPLEMENTATION** |

---

## 🚀 **Next Steps**

1. **Implement Client Management Pages** - High priority
2. **Add External Sourcing Integration** - Medium priority  
3. **Create Email Template System** - Medium priority
4. **Build Advanced Analytics** - Low priority

**Your frontend has excellent coverage but needs client management to complete the workflow!** 🎯
