# Prisma Setup Guide for Recruitment Platform

This guide will help you set up Prisma with PostgreSQL for the recruitment platform database.

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 15+
- npm or yarn

## 🗄️ Database Configuration

Your database is configured with:
- **Database Name**: `staffing_db`
- **Port**: `5432`
- **Password**: `Harish@2375`

The connection string is already configured in your `.env` file:
```
DATABASE_URL="postgresql://postgres:Harish@2375@localhost:5432/staffing_db"
```

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Generate Prisma Client

```bash
npm run prisma:generate
```

### 3. Create Database Migration

```bash
npm run prisma:migrate
```

### 4. Seed the Database

```bash
npm run prisma:seed
```

### 5. Start the Application

```bash
npm run dev
```

## 📊 Database Schema Overview

The database includes the following main tables:

### **User Management**
- `users` - User accounts and authentication
- `sessions` - JWT session management
- `audit_logs` - Activity tracking

### **Candidate Management**
- `candidate_profiles` - Candidate information
- `experiences` - Work experience
- `education` - Educational background
- `candidate_skills` - Skills with proficiency levels
- `assessments` - Candidate assessments

### **Job Management**
- `job_postings` - Job listings
- `job_skills` - Required skills with importance
- `companies` - Company information
- `recruiter_profiles` - Recruiter accounts
- `company_reviews` - Company reviews

### **Application Management**
- `applications` - Job applications
- `interviews` - Interview scheduling
- `application_activities` - Application tracking
- `application_feedback` - Feedback and ratings
- `saved_jobs` - Saved job listings

## 🔧 Available Commands

```bash
# Generate Prisma Client
npm run prisma:generate

# Create and run migrations
npm run prisma:migrate

# Deploy migrations to production
npm run prisma:deploy

# View database in Prisma Studio
npm run prisma:studio

# Seed database with sample data
npm run prisma:seed

# Reset database
npm run db:reset

# Push schema to database (dev only)
npm run db:push
```

## 🏗️ Schema Features

### **Advanced Data Types**
- Arrays for skills, languages, certifications
- JSON fields for flexible data storage
- Enums for controlled values
- Proper foreign key relationships

### **Security & Audit**
- Password hashing with bcrypt
- JWT session management
- Comprehensive audit logging
- Role-based access control

### **Business Logic**
- Application workflow stages
- Interview scheduling
- Skill matching capabilities
- Company rating system

## 📱 Prisma Studio

View and manage your database visually:

```bash
npm run prisma:studio
```

Access at: http://localhost:5555

## 🔍 Sample Data

The seed script creates:

### **Users**
- **Admin**: `admin@recruiter.com` / `admin123`
- **Recruiter**: `recruiter@company.com` / `recruiter123`
- **Candidate**: `candidate@email.com` / `candidate123`

### **Sample Content**
- 1 company (Tech Corp)
- 2 job postings
- 1 candidate profile with experience and education
- 1 job application with interview
- Skills, assessments, and reviews

## 🛠️ Development Workflow

1. **Make schema changes** in `prisma/schema.prisma`
2. **Generate migration**: `npm run prisma:migrate`
3. **Update client**: `npm run prisma:generate`
4. **Test changes**: `npm run prisma:studio`

## 🔒 Environment Variables

Required environment variables in `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:Harish@2375@localhost:5432/staffing_db"

# Application
NODE_ENV="development"
PORT="8000"

# JWT
JWT_SECRET="your-super-secret-jwt-key"
JWT_EXPIRES_IN="7d"
```

## 🚨 Troubleshooting

### **Connection Issues**
```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Test connection
psql -h localhost -p 5432 -U postgres -d staffing_db
```

### **Migration Issues**
```bash
# Reset and retry
npm run db:reset
npm run prisma:migrate
npm run prisma:seed
```

### **Permission Issues**
```sql
-- In PostgreSQL
GRANT ALL PRIVILEGES ON DATABASE staffing_db TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO postgres;
```

## 📈 Performance Tips

1. **Indexes**: Prisma automatically creates indexes for foreign keys
2. **Connection Pooling**: Configure in production
3. **Query Optimization**: Use `select` and `include` wisely
4. **Monitoring**: Use Prisma query logging

## 🔗 Next Steps

1. **API Development**: Build REST/GraphQL endpoints
2. **Authentication**: Implement JWT auth
3. **File Upload**: Add resume upload functionality
4. **Search**: Implement full-text search
5. **Analytics**: Add reporting dashboards

## 📚 Documentation

- [Prisma Docs](https://www.prisma.io/docs/)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

**Your Prisma database is now ready!** 🎉

Run `npm run prisma:studio` to explore your database structure and data.
