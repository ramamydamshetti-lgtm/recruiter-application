"""
Recruitment Platform ETL DAGs
ETL pipelines for data extraction, transformation, and loading
"""

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.redis.hooks.redis import RedisHook
from airflow.models import Variable
import pandas as pd
import requests
import json
import logging
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Default arguments for DAGs
default_args = {
    'owner': 'recruitment-etl',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
    'catchup': False,
}

# Database connection
POSTGRES_CONN_ID = 'postgres_recruitment'

def extract_candidate_data():
    """
    Extract candidate data from various sources
    """
    logging.info("Starting candidate data extraction")
    
    try:
        # Initialize database hook
        postgres_hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
        
        # Extract from internal database
        internal_candidates_sql = """
        SELECT 
            id,
            name,
            email,
            phone,
            current_employer,
            location,
            experience_label,
            technologies,
            created_at,
            updated_at
        FROM candidates 
        WHERE updated_at >= %s
        ORDER BY updated_at DESC
        """
        
        # Get last extraction time
        last_extraction = Variable.get("last_candidate_extraction", default_var=None)
        if last_extraction:
            last_extraction = datetime.fromisoformat(last_extraction)
        else:
            last_extraction = datetime.now() - timedelta(days=1)
        
        candidates_df = pd.read_sql(
            internal_candidates_sql, 
            postgres_hook.get_sqlalchemy_engine(),
            params=[last_extraction]
        )
        
        logging.info(f"Extracted {len(candidates_df)} candidates from internal database")
        
        # Extract from external job boards (API calls)
        external_candidates = []
        
        # Example: LinkedIn API integration
        linkedin_api_key = os.getenv('LINKEDIN_API_KEY')
        if linkedin_api_key:
            try:
                linkedin_response = requests.get(
                    'https://api.linkedin.com/v2/people',
                    headers={'Authorization': f'Bearer {linkedin_api_key}'},
                    params={'keywords': 'software engineer', 'location': 'United States'}
                )
                if linkedin_response.status_code == 200:
                    linkedin_data = linkedin_response.json()
                    external_candidates.extend(linkedin_data.get('elements', []))
                    logging.info(f"Extracted {len(external_candidates)} candidates from LinkedIn")
            except Exception as e:
                logging.error(f"Failed to extract from LinkedIn: {str(e)}")
        
        # Example: Indeed API integration
        indeed_api_key = os.getenv('INDEED_API_KEY')
        if indeed_api_key:
            try:
                indeed_response = requests.get(
                    'https://api.indeed.com/ads/apisearch',
                    params={
                        'publisher': indeed_api_key,
                        'q': 'software engineer',
                        'l': 'United States',
                        'format': 'json',
                        'v': '2'
                    }
                )
                if indeed_response.status_code == 200:
                    indeed_data = indeed_response.json()
                    external_candidates.extend(indeed_data.get('results', []))
                    logging.info(f"Extracted candidates from Indeed")
            except Exception as e:
                logging.error(f"Failed to extract from Indeed: {str(e)}")
        
        # Save extracted data to staging
        staging_data = {
            'internal_candidates': candidates_df.to_dict('records'),
            'external_candidates': external_candidates,
            'extraction_timestamp': datetime.now().isoformat()
        }
        
        # Store in Redis for temporary storage
        redis_hook = RedisHook(redis_conn_id='redis_default')
        redis_hook.get_conn().set(
            'candidate_staging_data',
            json.dumps(staging_data),
            ex=3600  # Expire in 1 hour
        )
        
        # Update last extraction time
        Variable.set("last_candidate_extraction", datetime.now().isoformat())
        
        logging.info("Candidate data extraction completed successfully")
        
    except Exception as e:
        logging.error(f"Error in candidate data extraction: {str(e)}")
        raise

def transform_candidate_data():
    """
    Transform candidate data - clean, normalize, and enrich
    """
    logging.info("Starting candidate data transformation")
    
    try:
        redis_hook = RedisHook(redis_conn_id='redis_default')
        staging_data = json.loads(redis_hook.get_conn().get('candidate_staging_data'))
        
        transformed_candidates = []
        
        # Transform internal candidates
        for candidate in staging_data['internal_candidates']:
            transformed = {
                'source': 'internal',
                'id': candidate['id'],
                'name': candidate['name'].strip().title(),
                'email': candidate['email'].lower().strip(),
                'phone': normalize_phone(candidate.get('phone')),
                'current_employer': candidate.get('current_employer', '').strip(),
                'location': normalize_location(candidate.get('location')),
                'experience_years': extract_experience_years(candidate.get('experience_label')),
                'technologies': normalize_technologies(candidate.get('technologies', [])),
                'created_at': candidate['created_at'],
                'updated_at': candidate['updated_at'],
                'data_quality_score': calculate_data_quality_score(candidate)
            }
            transformed_candidates.append(transformed)
        
        # Transform external candidates
        for candidate in staging_data['external_candidates']:
            transformed = {
                'source': 'external',
                'name': candidate.get('name', '').strip().title(),
                'email': candidate.get('email', '').lower().strip(),
                'phone': normalize_phone(candidate.get('phone')),
                'current_employer': candidate.get('company', '').strip(),
                'location': normalize_location(candidate.get('location')),
                'experience_years': extract_experience_years(candidate.get('experience')),
                'technologies': normalize_technologies(candidate.get('skills', [])),
                'created_at': datetime.now().isoformat(),
                'updated_at': datetime.now().isoformat(),
                'data_quality_score': calculate_data_quality_score(candidate)
            }
            transformed_candidates.append(transformed)
        
        # Deduplicate candidates
        deduplicated_candidates = deduplicate_candidates(transformed_candidates)
        
        # Save transformed data
        transformed_data = {
            'candidates': deduplicated_candidates,
            'transformation_timestamp': datetime.now().isoformat(),
            'total_candidates': len(deduplicated_candidates)
        }
        
        redis_hook.get_conn().set(
            'candidate_transformed_data',
            json.dumps(transformed_data),
            ex=3600
        )
        
        logging.info(f"Transformed {len(deduplicated_candidates)} candidates")
        
    except Exception as e:
        logging.error(f"Error in candidate data transformation: {str(e)}")
        raise

def load_candidate_data():
    """
    Load transformed candidate data into database
    """
    logging.info("Starting candidate data loading")
    
    try:
        postgres_hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
        redis_hook = RedisHook(redis_conn_id='redis_default')
        
        transformed_data = json.loads(redis_hook.get_conn().get('candidate_transformed_data'))
        candidates = transformed_data['candidates']
        
        # Load candidates in batches
        batch_size = 100
        for i in range(0, len(candidates), batch_size):
            batch = candidates[i:i + batch_size]
            
            for candidate in batch:
                # Check if candidate exists
                check_sql = """
                SELECT id FROM candidates WHERE email = %s
                """
                existing = postgres_hook.get_records(check_sql, parameters=[candidate['email']])
                
                if existing:
                    # Update existing candidate
                    update_sql = """
                    UPDATE candidates SET
                        name = %s,
                        phone = %s,
                        current_employer = %s,
                        location = %s,
                        experience_label = %s,
                        technologies = %s,
                        updated_at = %s
                    WHERE email = %s
                    """
                    postgres_hook.run(update_sql, parameters=[
                        candidate['name'],
                        candidate['phone'],
                        candidate['current_employer'],
                        candidate['location'],
                        candidate['experience_years'],
                        candidate['technologies'],
                        candidate['updated_at'],
                        candidate['email']
                    ])
                else:
                    # Insert new candidate
                    insert_sql = """
                    INSERT INTO candidates (
                        name, email, phone, current_employer, location,
                        experience_label, technologies, created_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """
                    postgres_hook.run(insert_sql, parameters=[
                        candidate['name'],
                        candidate['email'],
                        candidate['phone'],
                        candidate['current_employer'],
                        candidate['location'],
                        candidate['experience_years'],
                        candidate['technologies'],
                        candidate['created_at'],
                        candidate['updated_at']
                    ])
        
        logging.info(f"Loaded {len(candidates)} candidates into database")
        
        # Clean up Redis
        redis_hook.get_conn().delete('candidate_staging_data', 'candidate_transformed_data')
        
    except Exception as e:
        logging.error(f"Error in candidate data loading: {str(e)}")
        raise

def extract_requirement_data():
    """
    Extract requirement data from various sources
    """
    logging.info("Starting requirement data extraction")
    
    try:
        postgres_hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
        
        # Extract from internal database
        requirements_sql = """
        SELECT 
            id,
            client_lead_poc,
            role_title,
            location,
            experience,
            skills,
            technologies,
            priority,
            status,
            created_at,
            updated_at
        FROM requirements 
        WHERE is_deleted = false AND updated_at >= %s
        ORDER BY updated_at DESC
        """
        
        last_extraction = Variable.get("last_requirement_extraction", default_var=None)
        if last_extraction:
            last_extraction = datetime.fromisoformat(last_extraction)
        else:
            last_extraction = datetime.now() - timedelta(days=1)
        
        requirements_df = pd.read_sql(
            requirements_sql,
            postgres_hook.get_sqlalchemy_engine(),
            params=[last_extraction]
        )
        
        logging.info(f"Extracted {len(requirements_df)} requirements from internal database")
        
        # Store in staging
        staging_data = {
            'requirements': requirements_df.to_dict('records'),
            'extraction_timestamp': datetime.now().isoformat()
        }
        
        redis_hook = RedisHook(redis_conn_id='redis_default')
        redis_hook.get_conn().set(
            'requirement_staging_data',
            json.dumps(staging_data),
            ex=3600
        )
        
        Variable.set("last_requirement_extraction", datetime.now().isoformat())
        
        logging.info("Requirement data extraction completed successfully")
        
    except Exception as e:
        logging.error(f"Error in requirement data extraction: {str(e)}")
        raise

def generate_performance_reports():
    """
    Generate performance reports and analytics
    """
    logging.info("Starting performance report generation")
    
    try:
        postgres_hook = PostgresHook(postgres_conn_id=POSTGRES_CONN_ID)
        
        # Generate recruiter performance metrics
        performance_sql = """
        SELECT 
            rec.id,
            rec.name,
            rec.email,
            COUNT(DISTINCT r.id) as active_requirements,
            COUNT(DISTINCT cs.id) as total_submissions,
            COUNT(DISTINCT CASE WHEN cs.status = 'Interview' THEN cs.id END) as interviews,
            COUNT(DISTINCT CASE WHEN cs.status = 'Selected' THEN cs.id END) as selections,
            COUNT(DISTINCT CASE WHEN cs.status = 'Rejected' THEN cs.id END) as rejections,
            ROUND(AVG(EXTRACT(DAY FROM (CURRENT_TIMESTAMP - r.created_at))), 2) as avg_days_open,
            ROUND(COUNT(DISTINCT CASE WHEN cs.status = 'Selected' THEN cs.id END) * 100.0 / NULLIF(COUNT(DISTINCT cs.id), 0), 2) as selection_rate
        FROM recruiters rec
        LEFT JOIN requirements r ON rec.id = r.owner_id AND r.is_deleted = false AND r.status NOT IN ('Closed', 'Rejected')
        LEFT JOIN candidate_submissions cs ON rec.id = cs.submitted_by AND cs.submitted_on >= CURRENT_DATE - INTERVAL '30 days'
        WHERE rec.is_active = true
        GROUP BY rec.id, rec.name, rec.email
        ORDER BY total_submissions DESC
        """
        
        performance_df = pd.read_sql(performance_sql, postgres_hook.get_sqlalchemy_engine())
        
        # Generate requirement analytics
        requirement_analytics_sql = """
        SELECT 
            DATE_TRUNC('week', created_at) as week,
            COUNT(*) as new_requirements,
            COUNT(DISTINCT client_id) as unique_clients,
            AVG(CASE WHEN priority = 'High' THEN 1 WHEN priority = 'Medium' THEN 2 ELSE 3 END) as avg_priority_score
        FROM requirements 
        WHERE is_deleted = false AND created_at >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY DATE_TRUNC('week', created_at)
        ORDER BY week DESC
        """
        
        requirement_analytics_df = pd.read_sql(requirement_analytics_sql, postgres_hook.get_sqlalchemy_engine())
        
        # Generate submission funnel analytics
        funnel_sql = """
        SELECT 
            DATE_TRUNC('week', submitted_on) as week,
            COUNT(*) as submissions,
            COUNT(DISTINCT CASE WHEN status = 'Interview' THEN id END) as interviews,
            COUNT(DISTINCT CASE WHEN status = 'Selected' THEN id END) as selections,
            COUNT(DISTINCT CASE WHEN status = 'Rejected' THEN id END) as rejections
        FROM candidate_submissions 
        WHERE submitted_on >= CURRENT_DATE - INTERVAL '90 days'
        GROUP BY DATE_TRUNC('week', submitted_on)
        ORDER BY week DESC
        """
        
        funnel_df = pd.read_sql(funnel_sql, postgres_hook.get_sqlalchemy_engine())
        
        # Save reports to database or file system
        reports = {
            'recruiter_performance': performance_df.to_dict('records'),
            'requirement_analytics': requirement_analytics_df.to_dict('records'),
            'submission_funnel': funnel_df.to_dict('records'),
            'generated_at': datetime.now().isoformat()
        }
        
        # Store reports in Redis for dashboard access
        redis_hook = RedisHook(redis_conn_id='redis_default')
        redis_hook.get_conn().set(
            'performance_reports',
            json.dumps(reports),
            ex=86400  # Expire in 24 hours
        )
        
        logging.info("Performance reports generated successfully")
        
    except Exception as e:
        logging.error(f"Error in performance report generation: {str(e)}")
        raise

# Helper functions
def normalize_phone(phone):
    """Normalize phone number format"""
    if not phone:
        return None
    # Remove all non-numeric characters
    cleaned = ''.join(filter(str.isdigit, phone))
    if len(cleaned) == 10:
        return f"({cleaned[:3]}) {cleaned[3:6]}-{cleaned[6:]}"
    return phone

def normalize_location(location):
    """Normalize location format"""
    if not location:
        return None
    return location.strip().title()

def extract_experience_years(experience_label):
    """Extract years of experience from label"""
    if not experience_label:
        return None
    try:
        import re
        match = re.search(r'(\d+)', str(experience_label))
        return int(match.group(1)) if match else None
    except:
        return None

def normalize_technologies(technologies):
    """Normalize technology list"""
    if not technologies:
        return []
    if isinstance(technologies, str):
        technologies = [technologies]
    return [tech.strip().lower() for tech in technologies if tech.strip()]

def calculate_data_quality_score(candidate):
    """Calculate data quality score for candidate"""
    score = 0
    if candidate.get('name'):
        score += 20
    if candidate.get('email'):
        score += 20
    if candidate.get('phone'):
        score += 15
    if candidate.get('current_employer'):
        score += 15
    if candidate.get('location'):
        score += 10
    if candidate.get('experience_label'):
        score += 10
    if candidate.get('technologies'):
        score += 10
    return score

def deduplicate_candidates(candidates):
    """Deduplicate candidates based on email and phone"""
    seen = set()
    deduplicated = []
    
    for candidate in candidates:
        key = (candidate.get('email'), candidate.get('phone'))
        if key not in seen:
            seen.add(key)
            deduplicated.append(candidate)
    
    return deduplicated

# Define DAGs
candidate_etl_dag = DAG(
    'candidate_etl_pipeline',
    default_args=default_args,
    description='ETL pipeline for candidate data',
    schedule_interval='0 2 * * *',  # Run daily at 2 AM
    catchup=False,
    tags=['etl', 'candidates'],
)

candidate_etl_extract = PythonOperator(
    task_id='extract_candidate_data',
    python_callable=extract_candidate_data,
    dag=candidate_etl_dag,
)

candidate_etl_transform = PythonOperator(
    task_id='transform_candidate_data',
    python_callable=transform_candidate_data,
    dag=candidate_etl_dag,
)

candidate_etl_load = PythonOperator(
    task_id='load_candidate_data',
    python_callable=load_candidate_data,
    dag=candidate_etl_dag,
)

candidate_etl_extract >> candidate_etl_transform >> candidate_etl_load

requirement_etl_dag = DAG(
    'requirement_etl_pipeline',
    default_args=default_args,
    description='ETL pipeline for requirement data',
    schedule_interval='0 3 * * *',  # Run daily at 3 AM
    catchup=False,
    tags=['etl', 'requirements'],
)

requirement_etl_extract = PythonOperator(
    task_id='extract_requirement_data',
    python_callable=extract_requirement_data,
    dag=requirement_etl_dag,
)

performance_reports_dag = DAG(
    'performance_reports_pipeline',
    default_args=default_args,
    description='Generate performance reports and analytics',
    schedule_interval='0 4 * * *',  # Run daily at 4 AM
    catchup=False,
    tags=['reports', 'analytics'],
)

generate_reports = PythonOperator(
    task_id='generate_performance_reports',
    python_callable=generate_performance_reports,
    dag=performance_reports_dag,
)
