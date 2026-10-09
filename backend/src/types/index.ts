import { Request } from 'express';
import { JwtPayload } from 'jsonwebtoken';

// User types
export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'LEAD' | 'RECRUITER' | 'CANDIDATE';
  avatar?: string | null;
  phone?: string | null;
  submittingTo?: string | null;
  location?: string | null;
  bio?: string | null;
  isActive: boolean;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Auth types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'LEAD' | 'RECRUITER' | 'CANDIDATE';
}

export interface AuthResponse {
  user: Omit<User, 'password'>;
  token: string;
  /** True if the welcome email was accepted by SMTP (false if SMTP misconfigured or send failed) */
  welcomeEmailSent?: boolean;
}

// JWT Payload
export interface JwtPayloadExtended extends JwtPayload {
  userId: string;
  email: string;
  role: string;
}

// Express Request with User
export interface AuthenticatedRequest extends Request {
  user?: User;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Query parameters
export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface JobQuery extends PaginationQuery {
  search?: string;
  location?: string;
  jobType?: string;
  experienceLevel?: string;
  workMode?: string;
  salaryMin?: number;
  salaryMax?: number;
  companyId?: string;
  recruiterId?: string;
}

export interface CandidateQuery extends PaginationQuery {
  search?: string;
  location?: string;
  experienceMin?: number;
  experienceMax?: number;
  skills?: string[];
  jobType?: string;
  workMode?: string;
  salaryMin?: number;
  salaryMax?: number;
}

// Error types
export interface AppError extends Error {
  statusCode: number;
  isOperational: boolean;
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

// File upload types
export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
}

// Database types (matching Prisma schema)
export type UserRole = 'ADMIN' | 'LEAD' | 'RECRUITER' | 'CANDIDATE';
export type JobType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'INTERNSHIP' | 'FREELANCE' | 'TEMPORARY';
export type WorkMode = 'ONSITE' | 'REMOTE' | 'HYBRID';
export type ExperienceLevel = 'ENTRY_LEVEL' | 'JUNIOR' | 'MID_LEVEL' | 'SENIOR' | 'LEAD' | 'MANAGER' | 'DIRECTOR' | 'EXECUTIVE';
export type ApplicationStatus = 'PENDING' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'REJECTED' | 'WITHDRAWN' | 'HIRED';
export type ApplicationStage = 'APPLIED' | 'SCREENING' | 'INTERVIEW' | 'TECHNICAL_ASSESSMENT' | 'FINAL_INTERVIEW' | 'OFFER' | 'REJECTED' | 'WITHDRAWN';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type InterviewType = 'PHONE' | 'VIDEO' | 'ONSITE' | 'TECHNICAL' | 'BEHAVIORAL' | 'FINAL';
export type InterviewStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'RESCHEDULED';

// Email types
export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  template?: string;
  data?: Record<string, any>;
}

// Search and filter types
export interface SearchFilters {
  query?: string;
  filters?: Record<string, any>;
  facets?: string[];
}

export interface SearchResult<T> {
  items: T[];
  total: number;
  facets?: Record<string, any>;
  took: number;
}

// Notification types
export interface NotificationData {
  userId: string;
  type: 'APPLICATION' | 'INTERVIEW' | 'OFFER' | 'MESSAGE' | 'SYSTEM';
  title: string;
  message: string;
  data?: Record<string, any>;
  read: boolean;
  createdAt: Date;
}

// Analytics types
export interface AnalyticsEvent {
  event: string;
  userId?: string;
  properties: Record<string, any>;
  timestamp: Date;
}

export interface DashboardStats {
  totalUsers: number;
  totalJobs: number;
  totalApplications: number;
  activeApplications: number;
  recentActivity: AnalyticsEvent[];
}
