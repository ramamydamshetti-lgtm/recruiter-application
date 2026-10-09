import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import type { PrismaClient as PrismaClientType } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { PrismaClient } = require('@prisma/client') as typeof import('@prisma/client');

// Initialize Prisma Client
const prisma: PrismaClientType = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Create Express app
const app = express();

// Security middleware
app.use(helmet());

function buildAllowedOrigins(): string[] {
  const origins = new Set<string>(['http://localhost:3000', 'http://localhost:5000']);

  const raw = process.env.FRONTEND_URL?.trim();
  if (raw) {
    const base = raw.replace(/\/+$/, '');
    origins.add(base);

    try {
      const u = new URL(base);
      const host = u.hostname;
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
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error(`CORS blocked for origin: ${origin}`));
          },
    credentials: true,
  }),
);

// Rate limiting
// Mirrors the configuration in `index.ts` — env-tunable (RATE_LIMIT_MAX /
// RATE_LIMIT_WINDOW_MS), generous in non-production, and skips OPTIONS
// preflights + /health probes so they don't consume a user's quota.
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
        description: 'Development server',
      },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
  });
});

// Simple API routes for testing
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});

// Database test endpoint
app.get('/api/db-test', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ 
      message: 'Database connection successful',
      userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Database connection failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all users (for testing)
app.get('/api/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      }
    });
    res.json({ 
      message: 'Users retrieved successfully',
      data: users,
      count: users.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to retrieve users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get all jobs (for testing)
app.get('/api/jobs', async (req, res) => {
  try {
    const jobs = await prisma.jobPosting.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
            website: true,
          }
        }
      }
    });
    res.json({ 
      message: 'Jobs retrieved successfully',
      data: jobs,
      count: jobs.length
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Failed to retrieve jobs',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server
const PORT = process.env.PORT || 8000;

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    app.listen(PORT, () => {
      console.log(`🚀 Server is running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`🧪 Database Test: http://localhost:${PORT}/api/db-test`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 SIGTERM received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🔄 SIGINT received, shutting down gracefully');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
