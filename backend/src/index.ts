import dns from 'node:dns';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

// Prefer IPv4 for Microsoft Graph / Entra — broken IPv6 routes cause connect timeouts
// that break Forward-to-Client-Thread (createReplyAll) on this host.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Older Node builds without setDefaultResultOrder.
}

// Load environment variables BEFORE Prisma is imported/initialized.
dotenv.config();

import type { PrismaClient as PrismaClientType } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

// Import routes
import authRoutes from './routes/auth';
import loginRoutes from './routes/login';
import otpRoutes from './routes/otp';
import userRoutes from './routes/users';
import jobRoutes from './routes/jobs';
import applicationRoutes from './routes/applications';
import candidateRoutes from './routes/candidates';
import recruiterRoutes from './routes/recruiters';
import requirementSourceEmailPdfRoutes from './routes/requirementSourceEmailPdfRoute';
import requirementSimpleRoutes from './routes/requirementsSimple';
import submissionRoutes from './routes/submissions';
import notificationRoutes from './routes/notifications';
import interviewRoutes from './routes/interviews';
import metricsRoutes from './routes/metrics';
import offerLetterRoutes from './routes/offerLetters';
import interviewRoundRoutes from './routes/interviewRounds';
import offerManagementRoutes from './routes/offerManagement';
import clientRoutes from './routes/clients';
import internalAutomationRoutes from './routes/internalAutomation';
import jdExtractRoutes from './routes/jdExtract';
import {
  startEmailAutoIngestionPoller,
  stopEmailAutoIngestionPoller,
} from './services/emailAutoIngestionPoller';

// Import middleware
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Initialize Prisma Client
export const prisma: PrismaClientType = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Create Express app
const app = express();

// Security middleware
app.use(helmet());
// App is served behind reverse proxy (myapps.taskforge.com). This prevents
// express-rate-limit validation errors with X-Forwarded-For headers.
app.set('trust proxy', 1);

function buildAllowedOrigins(): string[] {
  // Live: 3000/8000. Dev (_Dev folder): 5000/8080 — keep both in CORS so neither stack breaks.
  const origins = new Set<string>(['http://localhost:3000', 'http://localhost:5000']);

  const raw = process.env.FRONTEND_URL?.trim();
  if (raw) {
    const base = raw.replace(/\/+$/, '');
    origins.add(base);

    // If FRONTEND_URL is set without a port, add common live + dev UI ports.
    try {
      const u = new URL(base);
      const host = u.hostname;
      // Default ports (omit :80 / :443 in the browser URL)
      origins.add(`http://${host}`);
      origins.add(`https://${host}`);
      origins.add(`http://${host}:3000`);
      origins.add(`http://${host}:5000`);
      origins.add(`https://${host}:3000`);
      origins.add(`https://${host}:5000`);
    } catch {
      // Ignore invalid FRONTEND_URL; fallback to localhost origins only.
    }
  }

  const extra = process.env.CORS_EXTRA_ORIGINS?.trim();
  if (extra) {
    for (const part of extra.split(',')) {
      const o = part.trim().replace(/\/+$/, '');
      if (o) origins.add(o);
    }
  }

  return Array.from(origins);
}

const allowedOrigins = buildAllowedOrigins();

// CORS configuration
app.use(
  cors({
    origin:
      process.env.NODE_ENV === 'production'
        ? allowedOrigins
        : (origin, cb) => {
            // Allow non-browser tools (curl/postman) with no Origin header
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error(`CORS blocked for origin: ${origin}`));
          },
    credentials: true,
  }),
);

// Rate limiting
//
// The previous configuration was a flat 1000 req / 15 min per IP across the
// entire `/api/*` surface. In active development that budget is easily
// exhausted by:
//   - dashboard auto-refresh polls (RequirementsDashboard polls every 15s/30s)
//   - heavy `getInterviews({ limit: 5000 })` fetches from MyWorkPage,
//     TeamWorkPage, InterviewTrackingPage, and SubmissionDetailClient
//   - Next.js dev hot-reload re-mounting pages and re-running their effects
// When the budget is gone, *every* /api endpoint returns 429, which surfaces
// to users as confusing "Failed to fetch interviews: Too Many Requests" errors
// in unrelated screens.
//
// We now:
//   1. Allow the limit and window to be overridden via env vars
//      (`RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS`) so prod can tighten safely.
//   2. Use a much higher default in non-production (15 000 / 15 min ≈
//      1 000 req/min) so dev workflows don't trip the limiter.
//   3. Skip the limiter for OPTIONS preflights and `/api/health`, which
//      should never consume a user's budget.
//   4. Emit standard `RateLimit-*` headers so the frontend can react.
const isProduction = process.env.NODE_ENV === 'production';
const rateLimitWindowMs = (() => {
  const raw = Number(process.env.RATE_LIMIT_WINDOW_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 15 * 60 * 1000;
})();
const rateLimitMax = (() => {
  const raw = Number(process.env.RATE_LIMIT_MAX);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return isProduction ? 1000 : 15000;
})();
const limiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    if (req.method === 'OPTIONS') return true;
    if (req.path === '/health' || req.path === '/api/health') return true;
    return false;
  },
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Metaforge IT Solutions API',
      version: '1.0.0',
      description: 'API for Metaforge IT Solutions — requirements, candidates, submissions, and workflows.',
      contact: {
        name: 'API Support',
        email: 'support@recruiter.com',
      },
    },
    servers: [
      {
        url: process.env.NODE_ENV === 'production' 
          ? 'https://api.yourdomain.com' 
          : 'http://localhost:8000',
        description: 'Production server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.ts', './src/models/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

function databaseNameFromEnv(): string | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  try {
    return new URL(url).pathname.replace(/^\//, '') || null;
  } catch {
    const match = url.match(/\/([^/?]+)(?:\?|$)/);
    return match?.[1] ?? null;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    database: databaseNameFromEnv(),
  });
});

// API routes
app.use('/api/auth', authRoutes);
// Legacy authEmail routes are intentionally disabled; consolidated under /api/auth.
app.use('/api/login', loginRoutes);
app.use('/api/otp', otpRoutes);
app.use('/api/users', userRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/recruiters', recruiterRoutes);
// PDF route on its own router, mounted first, so GET .../source-email-pdf always matches.
app.use('/api/requirements', requirementSourceEmailPdfRoutes);
app.use('/api/requirements', requirementSimpleRoutes); // Simple - no validation
app.use('/api/submissions', submissionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/api/metrics', metricsRoutes);
app.use('/api/interview-rounds', interviewRoundRoutes);
app.use('/api/offer-letters', offerLetterRoutes);
app.use('/api/offer-management', offerManagementRoutes);
app.use('/api/internal', internalAutomationRoutes);
app.use('/api/ai', jdExtractRoutes);
// app.use('/api/requirements', requirementOpenRoutes); // Open validation - no restrictions
// app.use('/api/requirements', requirementRoutes); // Original with validation - disabled
// app.use('/api/companies', companyRoutes); // Temporarily disabled

// Error handling middleware
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 8000;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    const dbName = databaseNameFromEnv();
    console.log(
      `✅ Database connected successfully${dbName ? ` (${dbName})` : ''}`,
    );

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      startEmailAutoIngestionPoller();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  stopEmailAutoIngestionPoller();
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  stopEmailAutoIngestionPoller();
  await prisma.$disconnect();
  process.exit(0);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

startServer();
