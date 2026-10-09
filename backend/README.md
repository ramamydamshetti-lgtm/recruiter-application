# Recruitment Platform Backend

A comprehensive recruitment platform backend built with FastAPI, PostgreSQL, and Airflow for data orchestration.

## Features

- **RESTful API**: FastAPI-based backend with automatic OpenAPI documentation
- **Database**: PostgreSQL with SQLAlchemy ORM and Alembic migrations
- **Data Integration**: Integration with major job boards (LinkedIn, Indeed, Glassdoor)
- **Resume Parsing**: AI-powered resume parsing and candidate profiling
- **Intelligent Matching**: Machine learning-based candidate-job matching
- **ETL Pipelines**: Airflow-based data processing and automation
- **Authentication**: JWT-based authentication and authorization
- **File Storage**: MinIO integration for file uploads and storage
- **Search & Analytics**: Elasticsearch for advanced search and analytics
- **Monitoring**: Prometheus and Grafana for system monitoring
- **Caching**: Redis for performance optimization

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   Database      │
│   (Next.js)     │◄──►│   (FastAPI)     │◄──►│   (PostgreSQL)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   Airflow       │
                       │   (ETL)         │
                       └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │   External      │
                       │   APIs          │
                       │   (Job Boards)  │
                       └─────────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Python 3.11+ (for local development)
- PostgreSQL 15+ (for local development)
- Redis 7+ (for local development)

### Using Docker Compose (Recommended)

1. Clone the repository:
```bash
git clone <repository-url>
cd recruiter-platform/backend
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Start all services:
```bash
docker-compose up -d
```

4. Initialize the database:
```bash
docker-compose exec backend python -m alembic upgrade head
```

5. Access the services:
- API: http://localhost:8000
- API Documentation: http://localhost:8000/docs
- Airflow: http://localhost:8080
- Kibana: http://localhost:5601
- Grafana: http://localhost:3001
- MinIO: http://localhost:9001

### Local Development

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up PostgreSQL and Redis:
```bash
# Start PostgreSQL and Redis services
sudo systemctl start postgresql
sudo systemctl start redis
```

3. Set up environment variables:
```bash
export DATABASE_URL="postgresql://user:password@localhost:5432/recruiter_platform"
export REDIS_URL="redis://localhost:6379"
```

4. Run migrations:
```bash
python -m alembic upgrade head
```

5. Start the application:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## API Documentation

The API documentation is automatically generated and available at:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Project Structure

```
backend/
├── api/                    # API endpoints
│   ├── auth.py            # Authentication endpoints
│   ├── candidates.py      # Candidate management
│   ├── jobs.py            # Job management
│   ├── applications.py    # Application management
│   └── analytics.py       # Analytics endpoints
├── core/                   # Core application logic
│   ├── config.py          # Configuration settings
│   ├── security.py        # Security utilities
│   └── dependencies.py    # Dependency injection
├── database/               # Database models and migrations
│   ├── models.py          # SQLAlchemy models
│   ├── connection.py      # Database connection
│   └── migrations/        # Alembic migrations
├── services/               # Business logic services
│   ├── data_integration_service.py  # Job board integrations
│   ├── resume_parser_service.py     # Resume parsing
│   ├── matching_service.py         # AI matching
│   └── notification_service.py     # Notifications
├── etl/                    # ETL pipelines
│   ├── dags/              # Airflow DAGs
│   ├── config/            # Airflow configuration
│   └── requirements.txt   # ETL dependencies
├── utils/                  # Utility functions
├── tests/                  # Test suite
├── scripts/                # Utility scripts
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile             # Docker image configuration
└── requirements.txt       # Python dependencies
```

## Services

### Data Integration Service

Handles integration with external job boards and APIs:

```python
from services.data_integration_service import DataIntegrationService

service = DataIntegrationService()
jobs = service.search_all_jobs("software engineer", "New York")
```

### Resume Parser Service

Parses and analyzes candidate resumes:

```python
from services.resume_parser_service import ResumeParserService

service = ResumeParserService()
resume = service.parse_resume("candidate_resume.pdf")
```

### Matching Service

AI-powered candidate-job matching:

```python
from services.matching_service import MatchingService

service = MatchingService()
matches = service.find_matches_for_job(job, candidates)
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/recruiter_platform

# Redis
REDIS_URL=redis://localhost:6379

# Security
SECRET_KEY=your-secret-key-here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# External APIs
LINKEDIN_API_KEY=your-linkedin-api-key
INDEED_API_KEY=your-indeed-api-key
GLASSDOOR_API_KEY=your-glassdoor-api-key
GLASSDOOR_PARTNER_ID=your-glassdoor-partner-id

# File Storage
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin123

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# Monitoring
PROMETHEUS_ENABLED=true
GRAFANA_ENABLED=true
```

### Database Configuration

The database schema is managed through Alembic migrations:

```bash
# Create new migration
python -m alembic revision --autogenerate -m "Add new table"

# Apply migrations
python -m alembic upgrade head

# Rollback migration
python -m alembic downgrade -1
```

## Testing

Run the test suite:

```bash
# Run all tests
pytest

# Run with coverage
pytest --cov=api --cov=services --cov=database

# Run specific test
pytest tests/test_auth.py
```

## Deployment

### Docker Deployment

1. Build the Docker image:
```bash
docker build -t recruiter-platform-backend .
```

2. Run with Docker Compose:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes Deployment

1. Create Kubernetes secrets:
```bash
kubectl create secret generic app-secrets --from-env-file=.env
```

2. Apply manifests:
```bash
kubectl apply -f k8s/
```

## Monitoring

### Prometheus Metrics

The application exposes metrics at `/metrics` endpoint:

- API request count and duration
- Database connection pool status
- Redis connection status
- Custom business metrics

### Grafana Dashboards

Pre-configured dashboards for:
- API performance
- Database performance
- System resources
- Business metrics

## Security

### Authentication

JWT-based authentication with the following features:
- Access tokens with configurable expiration
- Refresh tokens for long-term sessions
- Role-based authorization
- API key authentication for external services

### Data Protection

- Encrypted data at rest and in transit
- Input validation and sanitization
- SQL injection prevention
- Rate limiting
- CORS configuration

## Performance

### Optimization

- Database connection pooling
- Redis caching for frequently accessed data
- Async/await for I/O operations
- Background task processing with Celery
- Elasticsearch for search optimization

### Scaling

- Horizontal scaling with load balancers
- Database read replicas
- CDN for static assets
- Microservices architecture support

## Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Check DATABASE_URL configuration
   - Ensure PostgreSQL is running
   - Verify network connectivity

2. **Redis Connection Error**
   - Check REDIS_URL configuration
   - Ensure Redis is running
   - Verify firewall settings

3. **Airflow DAG Import Error**
   - Check DAG syntax and imports
   - Verify Python dependencies
   - Check Airflow logs

### Logs

Application logs are available in:
- Container logs: `docker-compose logs backend`
- File logs: `/app/logs/`
- Airflow logs: Airflow UI → Browse → Task Instances

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## Roadmap

- [ ] Add more job board integrations
- [ ] Implement advanced AI matching algorithms
- [ ] Add real-time notifications
- [ ] Implement multi-tenant support
- [ ] Add mobile API endpoints
- [ ] Implement GDPR compliance features
