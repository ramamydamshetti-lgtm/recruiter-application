-- PostgreSQL Database Schema for Recruitment Platform
-- Created: March 2026

-- Drop existing tables if they exist (for development)
DROP TABLE IF EXISTS candidate_submissions CASCADE;
DROP TABLE IF EXISTS candidates CASCADE;
DROP TABLE IF EXISTS requirement_assignments CASCADE;
DROP TABLE IF EXISTS requirements CASCADE;
DROP TABLE IF EXISTS recruiters CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Clients table (organizations that post job requirements)
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    industry VARCHAR(100),
    company_size VARCHAR(50),
    address TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true
);

-- Recruiters table (users who work on requirements)
CREATE TABLE recruiters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    title VARCHAR(100) DEFAULT 'Recruiter',
    role VARCHAR(50) DEFAULT 'Recruiter' CHECK (role IN ('Recruiter', 'Lead', 'Admin')),
    phone VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Requirements table (job demands/positions)
CREATE TABLE requirements (
    id VARCHAR(50) PRIMARY KEY, -- Format: REQ-YYYY-MM-DD-XXX
    client_id UUID REFERENCES clients(id) ON DELETE RESTRICT,
    client_lead_poc VARCHAR(255) NOT NULL,
    client_poc VARCHAR(255),
    role_title VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    experience VARCHAR(100),
    notice_period VARCHAR(100),
    skills TEXT[] NOT NULL,
    technologies TEXT[],
    priority VARCHAR(20) DEFAULT 'Medium' CHECK (priority IN ('High', 'Medium', 'Low')),
    open_positions INTEGER DEFAULT 1,
    sla_days INTEGER DEFAULT 30,
    submitting_to VARCHAR(255),
    client_jd_id VARCHAR(100),
    description TEXT,
    status VARCHAR(20) DEFAULT 'Open' CHECK (status IN ('Open', 'Assigned', 'Submitted', 'Interview', 'Selected', 'Rejected', 'Closed')),
    assignment VARCHAR(20) DEFAULT 'Unassigned' CHECK (assignment IN ('Unassigned', 'Assigned')),
    submissions_count INTEGER DEFAULT 0,
    owner_id UUID REFERENCES recruiters(id) ON DELETE RESTRICT,
    assigned_by VARCHAR(255),
    is_deleted BOOLEAN DEFAULT false,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

-- Requirement assignments table (tracks which recruiters are assigned to which requirements)
CREATE TABLE requirement_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requirement_id VARCHAR(50) REFERENCES requirements(id) ON DELETE CASCADE,
    recruiter_id UUID REFERENCES recruiters(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES recruiters(id) ON DELETE SET NULL,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    UNIQUE(requirement_id, recruiter_id)
);

-- Candidates table
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_code VARCHAR(50) UNIQUE, -- Format: Cand-YYYY-MM-DD-XXX
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    current_employer VARCHAR(255),
    location VARCHAR(255),
    experience_label VARCHAR(100),
    technologies TEXT[],
    resume_ref VARCHAR(255),
    resume_text TEXT,
    linkedin_url VARCHAR(500),
    highest_qualification VARCHAR(255),
    current_ctc DECIMAL(12,2),
    expected_ctc DECIMAL(12,2),
    notice_period VARCHAR(100),
    preferred_location VARCHAR(255),
    available_for_interview BOOLEAN DEFAULT true,
    reason_for_job_change TEXT,
    offer_in_hand BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Candidate submissions table
CREATE TABLE candidate_submissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    candidate_id UUID REFERENCES candidates(id) ON DELETE RESTRICT,
    requirement_id VARCHAR(50) REFERENCES requirements(id) ON DELETE RESTRICT,
    submitted_by UUID REFERENCES recruiters(id) ON DELETE RESTRICT,
    submitted_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(20) DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Interview', 'Selected', 'Rejected')),
    so_number VARCHAR(100),
    total_experience VARCHAR(100),
    relevant_experience VARCHAR(100),
    current_ctc VARCHAR(50),
    expected_ctc VARCHAR(50),
    notice_period VARCHAR(100),
    current_location VARCHAR(255),
    preferred_location VARCHAR(255),
    available_for_interview BOOLEAN,
    reason_for_job_change TEXT,
    offer_in_hand BOOLEAN,
    linkedin_url VARCHAR(500),
    highest_qualification VARCHAR(255),
    interview_date TIMESTAMP WITH TIME ZONE,
    interview_feedback TEXT,
    selection_date TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(candidate_id, requirement_id)
);

-- User sessions table for authentication
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recruiter_id UUID REFERENCES recruiters(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs table for tracking changes
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    old_values JSONB,
    new_values JSONB,
    changed_by UUID REFERENCES recruiters(id) ON DELETE SET NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ip_address INET,
    user_agent TEXT
);

-- Create indexes for performance
CREATE INDEX idx_requirements_status ON requirements(status);
CREATE INDEX idx_requirements_assignment ON requirements(assignment);
CREATE INDEX idx_requirements_client_id ON requirements(client_id);
CREATE INDEX idx_requirements_owner_id ON requirements(owner_id);
CREATE INDEX idx_requirements_created_at ON requirements(created_at);
CREATE INDEX idx_requirements_priority ON requirements(priority);

CREATE INDEX idx_candidates_email ON candidates(email);
CREATE INDEX idx_candidates_technologies ON candidates USING GIN(technologies);
CREATE INDEX idx_candidates_created_at ON candidates(created_at);

CREATE INDEX idx_submissions_candidate_id ON candidate_submissions(candidate_id);
CREATE INDEX idx_submissions_requirement_id ON candidate_submissions(requirement_id);
CREATE INDEX idx_submissions_submitted_by ON candidate_submissions(submitted_by);
CREATE INDEX idx_submissions_status ON candidate_submissions(status);
CREATE INDEX idx_submissions_submitted_on ON candidate_submissions(submitted_on);

CREATE INDEX idx_requirement_assignments_requirement_id ON requirement_assignments(requirement_id);
CREATE INDEX idx_requirement_assignments_recruiter_id ON requirement_assignments(recruiter_id);

CREATE INDEX idx_user_sessions_token ON user_sessions(session_token);
CREATE INDEX idx_user_sessions_recruiter_id ON user_sessions(recruiter_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_logs_changed_at ON audit_logs(changed_at);

-- Create trigger functions for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_recruiters_updated_at BEFORE UPDATE ON recruiters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_requirements_updated_at BEFORE UPDATE ON requirements FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidate_submissions_updated_at BEFORE UPDATE ON candidate_submissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for audit logging
CREATE OR REPLACE FUNCTION audit_trigger_function()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_values, changed_by)
        VALUES (TG_TABLE_NAME, OLD.id::TEXT, TG_OP, row_to_json(OLD), NULL);
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (table_name, record_id, action, old_values, new_values, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id::TEXT, TG_OP, row_to_json(OLD), row_to_json(NEW), NULL);
        RETURN NEW;
    ELSIF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (table_name, record_id, action, new_values, changed_by)
        VALUES (TG_TABLE_NAME, NEW.id::TEXT, TG_OP, row_to_json(NEW), NULL);
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create audit triggers
CREATE TRIGGER audit_recruiters_trigger AFTER INSERT OR UPDATE OR DELETE ON recruiters FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
CREATE TRIGGER audit_requirements_trigger AFTER INSERT OR UPDATE OR DELETE ON requirements FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
CREATE TRIGGER audit_candidates_trigger AFTER INSERT OR UPDATE OR DELETE ON candidates FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();
CREATE TRIGGER audit_candidate_submissions_trigger AFTER INSERT OR UPDATE OR DELETE ON candidate_submissions FOR EACH ROW EXECUTE FUNCTION audit_trigger_function();

-- Create view for active requirements with recruiter info
CREATE VIEW active_requirements_view AS
SELECT 
    r.id,
    r.client_lead_poc,
    r.role_title,
    r.location,
    r.experience,
    r.skills,
    r.technologies,
    r.priority,
    r.status,
    r.assignment,
    r.submissions_count,
    r.created_at,
    r.updated_at,
    rec.name as owner_name,
    rec.email as owner_email,
    rec.title as owner_title,
    c.name as client_name
FROM requirements r
JOIN recruiters rec ON r.owner_id = rec.id
JOIN clients c ON r.client_id = c.id
WHERE r.is_deleted = false AND r.status NOT IN ('Closed', 'Rejected');

-- Create view for recruiter performance metrics
CREATE VIEW recruiter_performance_view AS
SELECT 
    rec.id,
    rec.name,
    rec.email,
    rec.title,
    COUNT(DISTINCT r.id) as active_requirements,
    COUNT(DISTINCT cs.id) as total_submissions,
    COUNT(DISTINCT CASE WHEN cs.status = 'Interview' THEN cs.id END) as interviews,
    COUNT(DISTINCT CASE WHEN cs.status = 'Selected' THEN cs.id END) as selections,
    AVG(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - r.created_at))) as avg_days_open
FROM recruiters rec
LEFT JOIN requirements r ON rec.id = r.owner_id AND r.is_deleted = false AND r.status NOT IN ('Closed', 'Rejected')
LEFT JOIN candidate_submissions cs ON rec.id = cs.submitted_by
GROUP BY rec.id, rec.name, rec.email, rec.title;

-- Insert sample data for testing
INSERT INTO clients (name, email, phone, industry) VALUES
('Tech Solutions Inc', 'hr@techsolutions.com', '+1-555-0101', 'Technology'),
('Global Finance Corp', 'careers@globalfinance.com', '+1-555-0102', 'Finance'),
('Healthcare Systems', 'jobs@healthcaresystems.com', '+1-555-0103', 'Healthcare');

INSERT INTO recruiters (name, email, password_hash, title, role) VALUES
('John Smith', 'john.smith@recruitment.com', '$2b$12$placeholder_hash', 'Senior Recruiter', 'Recruiter'),
('Sarah Johnson', 'sarah.johnson@recruitment.com', '$2b$12$placeholder_hash', 'Recruitment Lead', 'Lead'),
('Mike Wilson', 'mike.wilson@recruitment.com', '$2b$12$placeholder_hash', 'Recruiter', 'Recruiter');

-- Create function to generate requirement ID
CREATE OR REPLACE FUNCTION generate_requirement_id()
RETURNS TEXT AS $$
DECLARE
    date_part TEXT;
    seq_num INTEGER;
    result TEXT;
BEGIN
    date_part := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
    
    -- Get the next sequence number for today
    SELECT COALESCE(MAX(CAST(SUBSTRING(id FROM '[^-]*$') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM requirements
    WHERE id LIKE 'REQ-' || date_part || '-%';
    
    result := 'REQ-' || date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to generate candidate code
CREATE OR REPLACE FUNCTION generate_candidate_code()
RETURNS TEXT AS $$
DECLARE
    date_part TEXT;
    seq_num INTEGER;
    result TEXT;
BEGIN
    date_part := TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD');
    
    -- Get the next sequence number for today
    SELECT COALESCE(MAX(CAST(SUBSTRING(candidate_code FROM '[^-]*$') AS INTEGER)), 0) + 1
    INTO seq_num
    FROM candidates
    WHERE candidate_code LIKE 'Cand-' || date_part || '-%';
    
    result := 'Cand-' || date_part || '-' || LPAD(seq_num::TEXT, 3, '0');
    RETURN result;
END;
$$ LANGUAGE plpgsql;
