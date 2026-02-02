import { FastifyInstance } from 'fastify';
import JobDatabase, { JobApplication } from '../database.js';

export async function registerJobTrackerRoutes(fastify: FastifyInstance, db: JobDatabase) {
  // Get all applications
  fastify.get('/api/jobs', async (request, _reply) => {
    const { status, type, startDate, endDate } = request.query as any;
    const applications = db.getAllApplications({ status, type, startDate, endDate });
    return applications;
  });

  // Get single application
  fastify.get('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const application = db.getApplication(parseInt(id));
    if (!application) {
      reply.code(404).send({ error: 'Application not found' });
      return;
    }
    return application;
  });

  // Create application
  fastify.post('/api/jobs', async (request, reply) => {
    const body = request.body as Omit<JobApplication, 'id'>;

    // Validate required fields
    if (!body.company || !body.role) {
      reply.code(400).send({ error: 'Company and role are required' });
      return;
    }

    // Set defaults
    const now = new Date().toISOString();
    const application = db.createApplication({
      ...body,
      applicationDate: body.applicationDate || now,
      lastUpdate: now,
      status: body.status || 'applied',
      type: body.type || 'targeted',
      remote: body.remote ?? false
    });

    return application;
  });

  // Update application
  fastify.patch('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as Partial<JobApplication>;

    const application = db.updateApplication(parseInt(id), updates);
    if (!application) {
      reply.code(404).send({ error: 'Application not found' });
      return;
    }

    return application;
  });

  // Delete application
  fastify.delete('/api/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = db.deleteApplication(parseInt(id));

    if (!deleted) {
      reply.code(404).send({ error: 'Application not found' });
      return;
    }

    return { success: true };
  });

  // Get analytics
  fastify.get('/api/jobs/analytics', async (_request, _reply) => {
    const analytics = db.getAnalytics();
    return analytics;
  });

  // Bulk status update
  fastify.post('/api/jobs/bulk-update', async (request, _reply) => {
    const { ids, updates } = request.body as { ids: number[]; updates: Partial<JobApplication> };

    const results = ids.map(id => db.updateApplication(id, updates)).filter(Boolean);

    return {
      updated: results.length,
      applications: results
    };
  });

  // Export to CSV
  fastify.get('/api/jobs/export', async (_request, reply) => {
    const applications = db.getAllApplications();

    const headers = ['ID', 'Company', 'Role', 'Location', 'Type', 'Status', 'Date Applied', 'Last Update', 'Remote', 'Source', 'Job URL', 'Notes'];
    const rows = applications.map(app => [
      app.id,
      app.company,
      app.role,
      app.location || '',
      app.type,
      app.status,
      app.applicationDate,
      app.lastUpdate,
      app.remote ? 'Yes' : 'No',
      app.source || '',
      app.jobUrl || '',
      (app.notes || '').replace(/\n/g, ' ')
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    reply
      .header('Content-Type', 'text/csv')
      .header('Content-Disposition', `attachment; filename="job-applications-${new Date().toISOString().split('T')[0]}.csv"`)
      .send(csv);
  });
}
