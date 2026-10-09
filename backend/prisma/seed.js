"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    console.log('🌱 Starting database seeding...');
    const adminPassword = await bcryptjs_1.default.hash('admin123', 10);
    const admin = await prisma.user.upsert({
        where: { email: 'admin@recruiter.com' },
        update: {},
        create: {
            email: 'admin@recruiter.com',
            password: adminPassword,
            firstName: 'Admin',
            lastName: 'User',
            role: 'ADMIN',
            isActive: true,
        },
    });
    const recruiterPassword = await bcryptjs_1.default.hash('recruiter123', 10);
    const recruiter = await prisma.user.upsert({
        where: { email: 'recruiter@company.com' },
        update: {},
        create: {
            email: 'recruiter@company.com',
            password: recruiterPassword,
            firstName: 'John',
            lastName: 'Recruiter',
            role: 'RECRUITER',
            isActive: true,
        },
    });
    const candidatePassword = await bcryptjs_1.default.hash('candidate123', 10);
    const candidate = await prisma.user.upsert({
        where: { email: 'candidate@email.com' },
        update: {},
        create: {
            email: 'candidate@email.com',
            password: candidatePassword,
            firstName: 'Jane',
            lastName: 'Candidate',
            role: 'CANDIDATE',
            isActive: true,
        },
    });
    const company = await prisma.company.upsert({
        where: { name: 'Tech Corp' },
        update: {},
        create: {
            name: 'Tech Corp',
            description: 'Leading technology company specializing in software development',
            website: 'https://techcorp.com',
            industry: 'Technology',
            size: '1000-5000',
            foundedYear: 2010,
            location: 'San Francisco, CA',
            email: 'hr@techcorp.com',
            phone: '+1-555-0123',
        },
    });
    const recruiterProfile = await prisma.recruiterProfile.upsert({
        where: { userId: recruiter.id },
        update: {},
        create: {
            userId: recruiter.id,
            companyName: 'Tech Corp',
            companySize: '1000-5000',
            industry: 'Technology',
            website: 'https://techcorp.com',
            phone: '+1-555-0123',
            department: 'Human Resources',
            jobTitle: 'Senior Technical Recruiter',
            bio: 'Experienced technical recruiter with 8+ years in tech industry',
            linkedinUrl: 'https://linkedin.com/in/johnrecruiter',
            isActive: true,
        },
    });
    const candidateProfile = await prisma.candidateProfile.upsert({
        where: { userId: candidate.id },
        update: {},
        create: {
            userId: candidate.id,
            headline: 'Senior Software Engineer',
            summary: 'Experienced software engineer with expertise in full-stack development',
            experienceYears: 5.5,
            currentJobTitle: 'Senior Software Engineer',
            currentCompany: 'Previous Company',
            desiredJobTitle: 'Senior Software Engineer',
            desiredLocation: 'San Francisco, CA',
            salaryMin: 120000,
            salaryMax: 180000,
            jobType: 'FULL_TIME',
            workMode: 'HYBRID',
            availability: 'Immediate',
            linkedinUrl: 'https://linkedin.com/in/janecandidate',
            githubUrl: 'https://github.com/janecandidate',
            portfolioUrl: 'https://janecandidate.dev',
            skills: [
                'JavaScript',
                'TypeScript',
                'React',
                'Node.js',
                'Python',
                'PostgreSQL',
                'AWS',
                'Docker',
                'Git',
                'REST APIs',
            ],
            languages: ['English', 'Spanish'],
            certifications: ['AWS Certified Developer', 'Google Cloud Professional'],
            noticePeriod: 30,
            willingToRelocate: true,
            isActive: true,
            visibility: 'PUBLIC',
        },
    });
    await prisma.experience.createMany({
        data: [
            {
                candidateId: candidateProfile.id,
                title: 'Senior Software Engineer',
                company: 'Previous Company',
                location: 'New York, NY',
                startDate: new Date('2021-01-01'),
                endDate: new Date('2023-12-31'),
                isCurrent: false,
                description: 'Led development of microservices architecture',
                skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS'],
                achievements: [
                    'Reduced API response time by 40%',
                    'Led team of 5 developers',
                    'Implemented CI/CD pipeline',
                ],
            },
            {
                candidateId: candidateProfile.id,
                title: 'Software Engineer',
                company: 'Startup Inc',
                location: 'Boston, MA',
                startDate: new Date('2019-06-01'),
                endDate: new Date('2020-12-31'),
                isCurrent: false,
                description: 'Full-stack development for SaaS platform',
                skills: ['JavaScript', 'React', 'Python', 'Django', 'PostgreSQL'],
                achievements: [
                    'Built MVP from scratch',
                    'Increased user engagement by 60%',
                    'Optimized database queries',
                ],
            },
        ],
    });
    await prisma.education.createMany({
        data: [
            {
                candidateId: candidateProfile.id,
                institution: 'University of Technology',
                degree: 'Bachelor of Science',
                field: 'Computer Science',
                startDate: new Date('2015-09-01'),
                endDate: new Date('2019-05-31'),
                isCurrent: false,
                gpa: 3.8,
                description: 'Graduated Magna Cum Laude',
                achievements: ['Dean\'s List', 'Computer Science Club President'],
            },
        ],
    });
    await prisma.candidateSkill.createMany({
        data: [
            {
                candidateId: candidateProfile.id,
                skillName: 'JavaScript',
                proficiency: 'EXPERT',
                yearsExp: 5.5,
                lastUsed: new Date(),
            },
            {
                candidateId: candidateProfile.id,
                skillName: 'TypeScript',
                proficiency: 'ADVANCED',
                yearsExp: 3.0,
                lastUsed: new Date(),
            },
            {
                candidateId: candidateProfile.id,
                skillName: 'React',
                proficiency: 'EXPERT',
                yearsExp: 4.0,
                lastUsed: new Date(),
            },
            {
                candidateId: candidateProfile.id,
                skillName: 'Node.js',
                proficiency: 'ADVANCED',
                yearsExp: 3.5,
                lastUsed: new Date(),
            },
            {
                candidateId: candidateProfile.id,
                skillName: 'Python',
                proficiency: 'INTERMEDIATE',
                yearsExp: 2.0,
                lastUsed: new Date(),
            },
        ],
    });
    const job1 = await prisma.jobPosting.create({
        data: {
            recruiterId: recruiterProfile.id,
            companyId: company.id,
            title: 'Senior Software Engineer',
            description: 'We are looking for a Senior Software Engineer to join our growing team. You will be responsible for designing, developing, and maintaining high-quality software solutions.',
            requirements: '5+ years of experience in software development, strong knowledge of JavaScript/TypeScript, experience with React and Node.js',
            responsibilities: 'Design and implement software solutions, collaborate with cross-functional teams, mentor junior developers',
            benefits: 'Competitive salary, health insurance, 401(k), flexible work hours, remote work options',
            location: 'San Francisco, CA',
            jobType: 'FULL_TIME',
            workMode: 'HYBRID',
            experienceLevel: 'SENIOR',
            salaryMin: 130000,
            salaryMax: 180000,
            currency: 'USD',
            department: 'Engineering',
            skills: [
                'JavaScript',
                'TypeScript',
                'React',
                'Node.js',
                'PostgreSQL',
                'AWS',
                'Docker',
            ],
            qualifications: ['Bachelor\'s degree in Computer Science or related field'],
            isRemote: false,
            isUrgent: false,
            isFeatured: true,
            isActive: true,
            expiresAt: new Date('2024-03-01'),
        },
    });
    const job2 = await prisma.jobPosting.create({
        data: {
            recruiterId: recruiterProfile.id,
            companyId: company.id,
            title: 'Full Stack Developer',
            description: 'Join our team as a Full Stack Developer and work on exciting projects that impact millions of users.',
            requirements: '3+ years of experience, proficiency in frontend and backend technologies',
            responsibilities: 'Develop and maintain web applications, collaborate with product team, write clean code',
            benefits: 'Great work environment, learning opportunities, career growth',
            location: 'New York, NY',
            jobType: 'FULL_TIME',
            workMode: 'REMOTE',
            experienceLevel: 'MID_LEVEL',
            salaryMin: 100000,
            salaryMax: 140000,
            currency: 'USD',
            department: 'Engineering',
            skills: [
                'JavaScript',
                'React',
                'Node.js',
                'Express',
                'MongoDB',
                'Git',
            ],
            qualifications: ['Bachelor\'s degree or equivalent experience'],
            isRemote: true,
            isUrgent: true,
            isFeatured: false,
            isActive: true,
            expiresAt: new Date('2024-02-15'),
        },
    });
    await prisma.jobSkill.createMany({
        data: [
            {
                jobId: job1.id,
                skillName: 'JavaScript',
                importance: 'REQUIRED',
                yearsExp: 5,
            },
            {
                jobId: job1.id,
                skillName: 'TypeScript',
                importance: 'REQUIRED',
                yearsExp: 3,
            },
            {
                jobId: job1.id,
                skillName: 'React',
                importance: 'REQUIRED',
                yearsExp: 4,
            },
            {
                jobId: job1.id,
                skillName: 'Node.js',
                importance: 'REQUIRED',
                yearsExp: 3,
            },
            {
                jobId: job1.id,
                skillName: 'PostgreSQL',
                importance: 'PREFERRED',
                yearsExp: 2,
            },
            {
                jobId: job2.id,
                skillName: 'JavaScript',
                importance: 'REQUIRED',
                yearsExp: 3,
            },
            {
                jobId: job2.id,
                skillName: 'React',
                importance: 'REQUIRED',
                yearsExp: 3,
            },
            {
                jobId: job2.id,
                skillName: 'Node.js',
                importance: 'REQUIRED',
                yearsExp: 2,
            },
            {
                jobId: job2.id,
                skillName: 'Express',
                importance: 'PREFERRED',
                yearsExp: 2,
            },
            {
                jobId: job2.id,
                skillName: 'MongoDB',
                importance: 'PREFERRED',
                yearsExp: 1,
            },
        ],
    });
    const application = await prisma.application.create({
        data: {
            jobId: job1.id,
            candidateId: candidateProfile.id,
            status: 'UNDER_REVIEW',
            stage: 'SCREENING',
            priority: 'HIGH',
            source: 'LinkedIn',
            coverLetter: 'I am excited to apply for the Senior Software Engineer position at Tech Corp. With my 5+ years of experience...',
            salaryExpectation: 150000,
            availability: '2 weeks',
            noticePeriod: 14,
        },
    });
    await prisma.interview.create({
        data: {
            applicationId: application.id,
            type: 'PHONE',
            title: 'Initial Phone Screening',
            description: 'Initial phone screening with HR',
            scheduledFor: new Date('2024-01-15T14:00:00Z'),
            duration: 30,
            location: 'Phone call',
            interviewerId: recruiter.id,
            status: 'SCHEDULED',
        },
    });
    await prisma.savedJob.create({
        data: {
            jobId: job2.id,
            candidateId: candidateProfile.id,
        },
    });
    await prisma.assessment.create({
        data: {
            candidateId: candidateProfile.id,
            type: 'TECHNICAL',
            title: 'JavaScript Coding Assessment',
            description: 'Test your JavaScript and React skills',
            maxScore: 100,
            status: 'PENDING',
        },
    });
    await prisma.companyReview.create({
        data: {
            companyId: company.id,
            reviewerId: candidate.id,
            rating: 4,
            title: 'Great place to work',
            pros: 'Excellent work-life balance, great colleagues, interesting projects',
            cons: 'Could use more modern tech stack',
            advice: 'Focus on employee development',
            isCurrent: false,
            jobTitle: 'Software Engineer',
            department: 'Engineering',
            yearsAtCompany: 2.5,
            isRecommended: true,
        },
    });
    console.log('✅ Database seeding completed successfully!');
    console.log('👤 Admin user: admin@recruiter.com / admin123');
    console.log('👤 Recruiter user: recruiter@company.com / recruiter123');
    console.log('👤 Candidate user: candidate@email.com / candidate123');
}
main()
    .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map