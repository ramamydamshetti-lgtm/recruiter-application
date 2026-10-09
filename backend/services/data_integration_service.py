"""
Data Integration Service for Recruitment Platform
Handles integration with external job boards and recruitment APIs
"""

import os
import logging
from typing import Dict, List, Optional, Any
from abc import ABC, abstractmethod
import requests
from datetime import datetime, timedelta
import json
from dataclasses import dataclass
from sqlalchemy.orm import Session
from database.models import JobPosting, Candidate, Application
from database.connection import get_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@dataclass
class JobData:
    """Standardized job data structure"""
    title: str
    description: str
    company: str
    location: str
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    job_type: Optional[str] = None
    experience_level: Optional[str] = None
    skills: List[str] = None
    posted_date: Optional[datetime] = None
    external_id: str = None
    source: str = None

class JobBoardIntegration(ABC):
    """Abstract base class for job board integrations"""
    
    def __init__(self, api_key: str, base_url: str):
        self.api_key = api_key
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        })
    
    @abstractmethod
    def search_jobs(self, query: str, location: str = None, **kwargs) -> List[JobData]:
        """Search for jobs on the platform"""
        pass
    
    @abstractmethod
    def get_job_details(self, job_id: str) -> JobData:
        """Get detailed job information"""
        pass

class LinkedInIntegration(JobBoardIntegration):
    """LinkedIn job board integration"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "https://api.linkedin.com/v2")
    
    def search_jobs(self, query: str, location: str = None, **kwargs) -> List[JobData]:
        """Search jobs on LinkedIn"""
        try:
            params = {
                'keywords': query,
                'location': location,
                'count': kwargs.get('limit', 50)
            }
            
            response = self.session.get(f"{self.base_url}/jobSearch", params=params)
            response.raise_for_status()
            
            jobs = []
            for job in response.json().get('elements', []):
                job_data = JobData(
                    title=job.get('title', ''),
                    description=job.get('description', {}).get('text', ''),
                    company=job.get('companyDetails', {}).get('name', ''),
                    location=job.get('formattedLocation', ''),
                    external_id=job.get('id'),
                    source='LinkedIn'
                )
                jobs.append(job_data)
            
            return jobs
            
        except Exception as e:
            logger.error(f"Error searching LinkedIn jobs: {str(e)}")
            return []
    
    def get_job_details(self, job_id: str) -> JobData:
        """Get detailed job information from LinkedIn"""
        try:
            response = self.session.get(f"{self.base_url}/jobs/{job_id}")
            response.raise_for_status()
            
            job = response.json()
            return JobData(
                title=job.get('title', ''),
                description=job.get('description', {}).get('text', ''),
                company=job.get('companyDetails', {}).get('name', ''),
                location=job.get('formattedLocation', ''),
                external_id=job.get('id'),
                source='LinkedIn'
            )
            
        except Exception as e:
            logger.error(f"Error getting LinkedIn job details: {str(e)}")
            return None

class IndeedIntegration(JobBoardIntegration):
    """Indeed job board integration"""
    
    def __init__(self, api_key: str):
        super().__init__(api_key, "https://api.indeed.com/ads/apisearch")
    
    def search_jobs(self, query: str, location: str = None, **kwargs) -> List[JobData]:
        """Search jobs on Indeed"""
        try:
            params = {
                'publisher': self.api_key,
                'q': query,
                'l': location,
                'limit': kwargs.get('limit', 25),
                'format': 'json',
                'v': '2'
            }
            
            response = self.session.get(self.base_url, params=params)
            response.raise_for_status()
            
            jobs = []
            for job in response.json().get('results', []):
                job_data = JobData(
                    title=job.get('jobtitle', ''),
                    description=job.get('snippet', ''),
                    company=job.get('company', ''),
                    location=job.get('formattedLocation', ''),
                    external_id=str(job.get('jobkey', '')),
                    source='Indeed'
                )
                jobs.append(job_data)
            
            return jobs
            
        except Exception as e:
            logger.error(f"Error searching Indeed jobs: {str(e)}")
            return []
    
    def get_job_details(self, job_id: str) -> JobData:
        """Get detailed job information from Indeed"""
        # Indeed API doesn't have a separate job details endpoint
        # Return None or implement web scraping if needed
        return None

class GlassdoorIntegration(JobBoardIntegration):
    """Glassdoor job board integration"""
    
    def __init__(self, api_key: str, partner_id: str):
        super().__init__(api_key, "https://api.glassdoor.com/api/api.htm")
        self.partner_id = partner_id
    
    def search_jobs(self, query: str, location: str = None, **kwargs) -> List[JobData]:
        """Search jobs on Glassdoor"""
        try:
            params = {
                't.p': self.partner_id,
                't.k': self.api_key,
                'userip': '127.0.0.1',
                'useragent': 'Mozilla/5.0',
                'action': 'jobs-search',
                'q': query,
                'l': location,
                'pn': kwargs.get('page', 1),
                'ps': kwargs.get('limit', 20)
            }
            
            response = self.session.get(self.base_url, params=params)
            response.raise_for_status()
            
            jobs = []
            data = response.json()
            
            if 'response' in data and 'jobs' in data['response']:
                for job in data['response']['jobs']:
                    job_data = JobData(
                        title=job.get('jobTitle', ''),
                        description=job.get('jobDescription', ''),
                        company=job.get('employer', {}).get('name', ''),
                        location=job.get('location', ''),
                        salary_min=job.get('salaryBase', 0),
                        external_id=str(job.get('jobId', '')),
                        source='Glassdoor'
                    )
                    jobs.append(job_data)
            
            return jobs
            
        except Exception as e:
            logger.error(f"Error searching Glassdoor jobs: {str(e)}")
            return []
    
    def get_job_details(self, job_id: str) -> JobData:
        """Get detailed job information from Glassdoor"""
        # Glassdoor API doesn't have a separate job details endpoint
        return None

class DataIntegrationService:
    """Main data integration service"""
    
    def __init__(self):
        self.integrations = {}
        self._setup_integrations()
    
    def _setup_integrations(self):
        """Setup job board integrations"""
        # LinkedIn Integration
        linkedin_api_key = os.getenv('LINKEDIN_API_KEY')
        if linkedin_api_key:
            self.integrations['linkedin'] = LinkedInIntegration(linkedin_api_key)
        
        # Indeed Integration
        indeed_api_key = os.getenv('INDEED_API_KEY')
        if indeed_api_key:
            self.integrations['indeed'] = IndeedIntegration(indeed_api_key)
        
        # Glassdoor Integration
        glassdoor_api_key = os.getenv('GLASSDOOR_API_KEY')
        glassdoor_partner_id = os.getenv('GLASSDOOR_PARTNER_ID')
        if glassdoor_api_key and glassdoor_partner_id:
            self.integrations['glassdoor'] = GlassdoorIntegration(
                glassdoor_api_key, glassdoor_partner_id
            )
    
    def search_all_jobs(self, query: str, location: str = None, 
                       sources: List[str] = None, limit: int = 50) -> List[JobData]:
        """Search jobs across all configured platforms"""
        all_jobs = []
        
        if not sources:
            sources = list(self.integrations.keys())
        
        for source in sources:
            if source in self.integrations:
                try:
                    jobs = self.integrations[source].search_jobs(
                        query, location, limit=limit
                    )
                    all_jobs.extend(jobs)
                    logger.info(f"Found {len(jobs)} jobs from {source}")
                except Exception as e:
                    logger.error(f"Error searching {source}: {str(e)}")
        
        return all_jobs
    
    def save_jobs_to_database(self, jobs: List[JobData], db: Session):
        """Save job data to database"""
        saved_count = 0
        
        for job_data in jobs:
            try:
                # Check if job already exists
                existing_job = db.query(JobPosting).filter(
                    JobPosting.external_id == job_data.external_id,
                    JobPosting.source == job_data.source
                ).first()
                
                if not existing_job:
                    job = JobPosting(
                        title=job_data.title,
                        description=job_data.description,
                        company=job_data.company,
                        location=job_data.location,
                        salary_min=job_data.salary_min,
                        salary_max=job_data.salary_max,
                        job_type=job_data.job_type,
                        experience_level=job_data.experience_level,
                        skills=job_data.skills or [],
                        posted_date=job_data.posted_date or datetime.utcnow(),
                        external_id=job_data.external_id,
                        source=job_data.source,
                        status='active'
                    )
                    db.add(job)
                    saved_count += 1
                else:
                    # Update existing job
                    existing_job.title = job_data.title
                    existing_job.description = job_data.description
                    existing_job.salary_min = job_data.salary_min
                    existing_job.salary_max = job_data.salary_max
                    existing_job.updated_at = datetime.utcnow()
                
            except Exception as e:
                logger.error(f"Error saving job {job_data.external_id}: {str(e)}")
                db.rollback()
                continue
        
        try:
            db.commit()
            logger.info(f"Successfully saved {saved_count} new jobs to database")
        except Exception as e:
            logger.error(f"Error committing jobs to database: {str(e)}")
            db.rollback()
        
        return saved_count
    
    def get_active_integrations(self) -> List[str]:
        """Get list of active integrations"""
        return list(self.integrations.keys())
    
    def test_integration(self, source: str) -> bool:
        """Test integration with a specific job board"""
        if source not in self.integrations:
            return False
        
        try:
            # Try a simple search
            jobs = self.integrations[source].search_jobs("software engineer", limit=1)
            return len(jobs) > 0
        except Exception as e:
            logger.error(f"Integration test failed for {source}: {str(e)}")
            return False

# Usage example
if __name__ == "__main__":
    service = DataIntegrationService()
    
    # Test integrations
    for source in service.get_active_integrations():
        status = "✓" if service.test_integration(source) else "✗"
        print(f"{status} {source}")
    
    # Search for jobs
    db = next(get_db())
    jobs = service.search_all_jobs("software engineer", "New York")
    saved = service.save_jobs_to_database(jobs, db)
    print(f"Saved {saved} new jobs to database")
