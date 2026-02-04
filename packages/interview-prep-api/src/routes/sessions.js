import db from '../database.js';

export default async function sessionsRoutes(fastify) {
  // Get all study sessions
  fastify.get('/sessions', async (request, reply) => {
    const sessions = db.prepare(`
      SELECT s.*, t.name as topic_name, t.category as topic_category
      FROM study_sessions s
      LEFT JOIN system_design_topics t ON s.topic_id = t.id
      ORDER BY s.date DESC
    `).all();
    return sessions;
  });

  // Get sessions for a specific topic
  fastify.get('/sessions/topic/:topicId', async (request, reply) => {
    const { topicId } = request.params;
    const sessions = db.prepare(`
      SELECT s.*, t.name as topic_name, t.category as topic_category
      FROM study_sessions s
      LEFT JOIN system_design_topics t ON s.topic_id = t.id
      WHERE s.topic_id = ?
      ORDER BY s.date DESC
    `).all(topicId);
    return sessions;
  });

  // Create study session
  fastify.post('/sessions', async (request, reply) => {
    const { topic_id, date, duration_minutes, notes } = request.body;

    const result = db.prepare(`
      INSERT INTO study_sessions (topic_id, date, duration_minutes, notes)
      VALUES (?, ?, ?, ?)
    `).run(topic_id, date, duration_minutes, notes || null);

    // Update topic's last_studied date and calculate next_review (spaced repetition)
    if (topic_id) {
      const topic = db.prepare('SELECT confidence FROM system_design_topics WHERE id = ?').get(topic_id);

      // Calculate next review based on confidence (1-5)
      // Confidence 1: 1 day, 2: 3 days, 3: 7 days, 4: 14 days, 5: 30 days
      const reviewIntervals = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };
      const interval = reviewIntervals[topic?.confidence || 3];

      const nextReview = new Date(date);
      nextReview.setDate(nextReview.getDate() + interval);

      db.prepare(`
        UPDATE system_design_topics
        SET last_studied = ?, next_review = ?
        WHERE id = ?
      `).run(date, nextReview.toISOString().split('T')[0], topic_id);
    }

    const session = db.prepare(`
      SELECT s.*, t.name as topic_name, t.category as topic_category
      FROM study_sessions s
      LEFT JOIN system_design_topics t ON s.topic_id = t.id
      WHERE s.id = ?
    `).get(result.lastInsertRowid);

    return reply.code(201).send(session);
  });

  // Update study session
  fastify.put('/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    const { topic_id, date, duration_minutes, notes } = request.body;

    const updates = [];
    const values = [];

    if (topic_id !== undefined) {
      updates.push('topic_id = ?');
      values.push(topic_id);
    }
    if (date !== undefined) {
      updates.push('date = ?');
      values.push(date);
    }
    if (duration_minutes !== undefined) {
      updates.push('duration_minutes = ?');
      values.push(duration_minutes);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'No updates provided' });
    }

    values.push(id);
    db.prepare(`UPDATE study_sessions SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const session = db.prepare(`
      SELECT s.*, t.name as topic_name, t.category as topic_category
      FROM study_sessions s
      LEFT JOIN system_design_topics t ON s.topic_id = t.id
      WHERE s.id = ?
    `).get(id);

    return session;
  });

  // Delete study session
  fastify.delete('/sessions/:id', async (request, reply) => {
    const { id } = request.params;
    db.prepare('DELETE FROM study_sessions WHERE id = ?').run(id);
    return { success: true };
  });
}
