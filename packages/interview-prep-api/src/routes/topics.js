import db from '../database.js';

export default async function topicsRoutes(fastify) {
  // Get all topics
  fastify.get('/topics', async (request, reply) => {
    const topics = db.prepare('SELECT * FROM system_design_topics ORDER BY category, name').all();
    return topics;
  });

  // Get single topic
  fastify.get('/topics/:id', async (request, reply) => {
    const { id } = request.params;
    const topic = db.prepare('SELECT * FROM system_design_topics WHERE id = ?').get(id);
    if (!topic) {
      return reply.code(404).send({ error: 'Topic not found' });
    }
    return topic;
  });

  // Create topic
  fastify.post('/topics', async (request, reply) => {
    const { name, category, confidence, notes } = request.body;
    const result = db.prepare(
      'INSERT INTO system_design_topics (name, category, confidence, notes) VALUES (?, ?, ?, ?)'
    ).run(name, category, confidence || 3, notes || null);

    const topic = db.prepare('SELECT * FROM system_design_topics WHERE id = ?').get(result.lastInsertRowid);
    return reply.code(201).send(topic);
  });

  // Update topic
  fastify.put('/topics/:id', async (request, reply) => {
    const { id } = request.params;
    const { name, category, confidence, notes, last_studied, next_review } = request.body;

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (category !== undefined) {
      updates.push('category = ?');
      values.push(category);
    }
    if (confidence !== undefined) {
      updates.push('confidence = ?');
      values.push(confidence);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }
    if (last_studied !== undefined) {
      updates.push('last_studied = ?');
      values.push(last_studied);
    }
    if (next_review !== undefined) {
      updates.push('next_review = ?');
      values.push(next_review);
    }

    if (updates.length === 0) {
      return reply.code(400).send({ error: 'No updates provided' });
    }

    values.push(id);
    db.prepare(`UPDATE system_design_topics SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const topic = db.prepare('SELECT * FROM system_design_topics WHERE id = ?').get(id);
    return topic;
  });

  // Delete topic
  fastify.delete('/topics/:id', async (request, reply) => {
    const { id } = request.params;
    db.prepare('DELETE FROM system_design_topics WHERE id = ?').run(id);
    return { success: true };
  });

  // Get topics by category
  fastify.get('/topics/category/:category', async (request, reply) => {
    const { category } = request.params;
    const topics = db.prepare('SELECT * FROM system_design_topics WHERE category = ? ORDER BY name').all(category);
    return topics;
  });

  // Get all categories
  fastify.get('/categories', async (request, reply) => {
    const categories = db.prepare('SELECT DISTINCT category FROM system_design_topics ORDER BY category').all();
    return categories.map(c => c.category);
  });
}
