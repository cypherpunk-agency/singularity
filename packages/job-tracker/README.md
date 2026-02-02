# Job Application Tracker

A complete job application tracking system for Singularity to help Tommi manage his job search.

## Features

- **Application Management**: Track all job applications with detailed information
- **Status Workflow**: Applied → Screening → Interview → Offer/Rejected/Ghosted
- **Application Types**: Targeted, Mass, Network referrals
- **Analytics Dashboard**: Success rates, response rates, daily progress
- **Daily Goals**: Track progress toward 2 applications/day goal
- **Export**: CSV export for external analysis
- **RESTful API**: Full CRUD operations

## Data Model

### Application Fields
- Company, Role, Location
- Type: targeted | mass | network
- Status: applied | screening | interview | offer | rejected | ghosted
- Application Date, Last Update
- Job URL, Source, Contact Person
- Salary range, Remote/Hybrid/On-site
- Notes

### Analytics
- Total applications by status and type
- Response rate (% that get past applied)
- Interview rate (% that reach interview stage)
- Daily activity tracking
- Goal progress

## API Endpoints

```
GET    /api/jobs                 - List all applications (with filters)
GET    /api/jobs/:id             - Get single application
POST   /api/jobs                 - Create application
PATCH  /api/jobs/:id             - Update application
DELETE /api/jobs/:id             - Delete application
GET    /api/jobs/analytics       - Get analytics
POST   /api/jobs/bulk-update     - Update multiple applications
GET    /api/jobs/export          - Export as CSV
GET    /health                   - Health check
```

## Query Parameters (GET /api/jobs)
- `status` - Filter by status
- `type` - Filter by type
- `startDate` - Filter from date
- `endDate` - Filter to date

## Database

SQLite database stored at `/app/state/job-tracker.db`

Tables:
- `applications` - Main application data
- `daily_goals` - Daily application goals

## Development

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build
npm run build

# Run production
npm start
```

## Integration with Singularity UI

The job tracker can be integrated into the main Singularity UI as a new tab, or run as a standalone service on port 3002.

## Use Cases

1. **Daily Tracking**: Log 2 applications per day, track progress
2. **Follow-ups**: See which applications need follow-up
3. **Analytics**: Understand what's working (targeted vs mass, sources, etc.)
4. **Network Activation**: Track network referrals separately
5. **Interview Prep**: See upcoming interviews, track interview stage applications
6. **Export**: Share progress with accountability partners or recruiters
