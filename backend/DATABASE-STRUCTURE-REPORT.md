# 🗄️ Database Structure Report

## 📊 **Total Tables Created: 19**

---

## 🏗️ **TABLES & PAGE DATA MAPPING**

### **🔐 AUTHENTICATION TABLES**

#### **1. users** 
- **Purpose**: User authentication & basic profile
- **Pages**: Login, Register, Profile Settings
- **Fields**: email, password, firstName, lastName, role, avatar, phone, location, bio, emailVerified
- **Relations**: Links to candidateProfile, recruiterProfile, sessions, emailVerification

#### **2. sessions**
- **Purpose**: User login sessions/tokens
- **Pages**: Login system (background)
- **Fields**: userId, token, expiresAt
- **Relations**: Links to users table

#### **3. email_verifications**
- **Purpose**: Email verification tokens
- **Pages**: Email verification flow
- **Fields**: userId, token, expiresAt
- **Relations**: Links to users table

---

### **👤 USER PROFILE TABLES**

#### **4. candidate_profiles**
- **Purpose**: Complete candidate professional profile
- **Pages**: Candidate Dashboard, Profile Edit, Job Applications
- **Fields**: headline, summary, experienceYears, currentJobTitle, desiredJobTitle, salaryMin/Max, jobType, workMode, skills, languages, certifications, resumeUrl, linkedinUrl, githubUrl, portfolioUrl
- **Relations**: Links to users, applications, skills, education, experience, savedJobs

#### **5. recruiter_profiles**
- **Purpose**: Recruiter professional profile
- **Pages**: Recruiter Dashboard, Company Management, Job Posting
- **Fields**: companyName, companySize, industry, website, logoUrl, phone, department, jobTitle, bio
- **Relations**: Links to users, companies, jobPostings

#### **6. companies**
- **Purpose**: Company information & details
- **Pages**: Company Profile, Job Listings, Company Reviews
- **Fields**: name, description, website, logoUrl, industry, size, foundedYear, location, phone, email, linkedinUrl, twitterUrl
- **Relations**: Links to recruiterProfiles, jobPostings, companyReviews

---

### **💼 EXPERIENCE & EDUCATION TABLES**

#### **7. experiences**
- **Purpose**: Candidate work experience
- **Pages**: Candidate Profile, Resume Builder
- **Fields**: title, company, location, startDate, endDate, isCurrent, description, skills, achievements
- **Relations**: Links to candidate_profiles

#### **8. education**
- **Purpose**: Candidate education history
- **Pages**: Candidate Profile, Resume Builder
- **Fields**: institution, degree, field, startDate, endDate, isCurrent, gpa, description, achievements
- **Relations**: Links to candidate_profiles

#### **9. candidate_skills**
- **Purpose**: Candidate skills with proficiency
- **Pages**: Candidate Profile, Skill Assessment, Job Matching
- **Fields**: skillName, proficiency, yearsExp, lastUsed
- **Relations**: Links to candidate_profiles

---

### **📋 JOB MANAGEMENT TABLES**

#### **10. job_postings**
- **Purpose**: Job advertisements & listings
- **Pages**: Job Board, Job Details, Recruiter Dashboard
- **Fields**: title, description, requirements, responsibilities, benefits, location, jobType, workMode, experienceLevel, salaryMin/Max, skills, qualifications, isRemote, isUrgent, isFeatured, viewsCount, applicationsCount
- **Relations**: Links to recruiterProfiles, companies, applications, jobSkills, savedJobs

#### **11. job_skills**
- **Purpose**: Required skills for specific jobs
- **Pages**: Job Details, Skill Matching
- **Fields**: skillName, importance, yearsExp
- **Relations**: Links to job_postings

---

### **📝 APPLICATION FLOW TABLES**

#### **12. applications**
- **Purpose**: Job applications submitted by candidates
- **Pages**: Application Tracking, Candidate Applied Jobs, Recruiter Applications
- **Fields**: status, stage, priority, source, coverLetter, resumeUrl, portfolioUrl, notes, salaryExpectation, availability, noticePeriod
- **Relations**: Links to candidate_profiles, job_postings, interviews, activities, feedback

#### **13. interviews**
- **Purpose**: Interview scheduling & management
- **Pages**: Interview Calendar, Application Details
- **Fields**: type, title, description, scheduledFor, duration, location, status, notes, feedback, rating
- **Relations**: Links to applications

#### **14. application_activities**
- **Purpose**: Application activity tracking
- **Pages**: Application Timeline, Audit Trail
- **Fields**: action, description, performedBy
- **Relations**: Links to applications

#### **15. application_feedback**
- **Purpose**: Interview feedback & reviews
- **Pages**: Application Review, Interview Feedback
- **Fields**: rating, strengths, weaknesses, recommendation, notes
- **Relations**: Links to applications

---

### **🎯 INTERACTION TABLES**

#### **16. saved_jobs**
- **Purpose**: Jobs saved/bookmarked by candidates
- **Pages**: Candidate Dashboard, Saved Jobs
- **Fields**: savedAt
- **Relations**: Links to candidate_profiles, job_postings

#### **17. assessments**
- **Purpose**: Candidate assessments & tests
- **Pages**: Assessment Portal, Candidate Testing
- **Fields**: type, title, description, score, maxScore, status, results, completedAt
- **Relations**: Links to candidate_profiles

---

### **⭐ REVIEW & AUDIT TABLES**

#### **18. company_reviews**
- **Purpose**: Company reviews by employees/candidates
- **Pages**: Company Profile, Review Section
- **Fields**: rating, title, pros, cons, advice, isCurrent, jobTitle, department, yearsAtCompany, isRecommended
- **Relations**: Links to companies

#### **19. audit_logs**
- **Purpose**: System activity logging
- **Pages**: Admin Dashboard, System Logs (background)
- **Fields**: action, entity, entityId, oldValues, newValues, ipAddress, userAgent
- **Relations**: Links to users

---

## 🔄 **PAGE DATA FLOW DIAGRAM**

```
📱 LOGIN PAGE
├── users (authentication)
├── sessions (token management)
└── email_verifications (if needed)

👤 CANDIDATE DASHBOARD
├── candidate_profiles (main data)
├── experiences (work history)
├── education (academic background)
├── candidate_skills (skill inventory)
├── applications (submitted applications)
├── saved_jobs (bookmarked positions)
└── assessments (completed tests)

🏢 RECRUITER DASHBOARD
├── recruiter_profiles (recruiter info)
├── companies (company details)
├── job_postings (published jobs)
├── applications (received applications)
└── interviews (scheduled interviews)

📋 JOB BOARD
├── job_postings (job listings)
├── companies (hiring companies)
├── job_skills (required skills)
└── saved_jobs (user bookmarks)

📊 ADMIN PANEL
├── audit_logs (system activity)
├── users (user management)
└── company_reviews (content moderation)
```

---

## 📈 **DATA VOLUME ESTIMATES**

| **Table** | **Expected Records** | **Growth Rate** |
|-----------|---------------------|-----------------|
| users | 1,000 - 10,000 | 50/month |
| candidate_profiles | 500 - 5,000 | 40/month |
| job_postings | 100 - 1,000 | 20/month |
| applications | 1,000 - 20,000 | 200/month |
| companies | 50 - 500 | 10/month |
| audit_logs | 10,000 - 100,000 | 1,000/day |

---

## 🎯 **KEY INSIGHTS**

### **✅ Well-Structured**
- **Clear separation** between candidate, recruiter, and company data
- **Proper relationships** with foreign keys
- **Audit trails** for all important activities

### **✅ Comprehensive Coverage**
- **Full recruitment lifecycle** from job posting to hiring
- **Rich profile data** for both candidates and recruiters
- **Activity tracking** for application progress

### **✅ Scalable Design**
- **Normalized schema** reduces data redundancy
- **Index-friendly** structure for performance
- **JSON fields** for flexible data storage

Your database structure is **enterprise-grade** and ready for production deployment! 🚀
