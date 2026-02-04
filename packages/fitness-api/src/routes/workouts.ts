import { FastifyInstance } from 'fastify';
import {
  saveWorkout,
  loadWorkout,
  listWorkouts,
  calculateStats,
  generateWorkoutId,
} from '../services/storage';
import { CreateWorkoutRequest, Workout } from '../types';

export async function workoutRoutes(fastify: FastifyInstance) {
  // Get all workouts (optionally filtered by user)
  fastify.get<{ Querystring: { user?: 'tommi' | 'finn' } }>(
    '/workouts',
    async (request, reply) => {
      try {
        const { user } = request.query;
        const workouts = await listWorkouts(user);
        reply.send({ workouts });
      } catch (error) {
        request.log.error(error);
        reply.status(500).send({ error: 'Failed to list workouts' });
      }
    }
  );

  // Get specific workout by ID
  fastify.get<{ Params: { id: string } }>('/workouts/:id', async (request, reply) => {
    try {
      const { id } = request.params;
      const workout = await loadWorkout(id);

      if (!workout) {
        reply.status(404).send({ error: 'Workout not found' });
        return;
      }

      reply.send({ workout });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to load workout' });
    }
  });

  // Create new workout
  fastify.post<{ Body: CreateWorkoutRequest }>('/workouts', async (request, reply) => {
    try {
      const { user, date, duration, type, exercises, notes } = request.body;

      // Validate required fields
      if (!user || !date || !exercises || exercises.length === 0) {
        reply.status(400).send({ error: 'Missing required fields' });
        return;
      }

      const workoutDate = new Date(date);
      const id = generateWorkoutId(user, workoutDate);

      const workout: Workout = {
        id,
        user,
        date: workoutDate.toISOString(),
        duration,
        type,
        exercises,
        notes,
      };

      await saveWorkout(workout);

      reply.status(201).send({ workout });
    } catch (error) {
      request.log.error(error);
      reply.status(500).send({ error: 'Failed to create workout' });
    }
  });

  // Get workout statistics
  fastify.get<{ Querystring: { user?: 'tommi' | 'finn' } }>(
    '/stats',
    async (request, reply) => {
      try {
        const { user } = request.query;
        const stats = await calculateStats(user);
        reply.send({ stats });
      } catch (error) {
        request.log.error(error);
        reply.status(500).send({ error: 'Failed to calculate stats' });
      }
    }
  );

  // Get user-specific workouts
  fastify.get<{ Params: { user: 'tommi' | 'finn' } }>(
    '/users/:user/workouts',
    async (request, reply) => {
      try {
        const { user } = request.params;
        const workouts = await listWorkouts(user);
        reply.send({ workouts });
      } catch (error) {
        request.log.error(error);
        reply.status(500).send({ error: 'Failed to list workouts' });
      }
    }
  );
}
