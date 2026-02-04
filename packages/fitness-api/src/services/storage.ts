import fs from 'fs/promises';
import path from 'path';
import { Workout, Exercise, WorkoutStats } from '../types';

const FITNESS_DIR = '/app/agent/fitness/workouts';

/**
 * Convert workout to markdown format
 */
export function workoutToMarkdown(workout: Workout): string {
  const date = new Date(workout.date);
  const dateStr = date.toISOString().split('T')[0];
  const timeStr = date.toTimeString().slice(0, 5);

  let md = `# Workout - ${dateStr} ${timeStr}\n\n`;
  md += `**User:** ${workout.user.charAt(0).toUpperCase() + workout.user.slice(1)}\n`;

  if (workout.duration) {
    md += `**Duration:** ${workout.duration} minutes\n`;
  }

  if (workout.type) {
    md += `**Type:** ${workout.type}\n`;
  }

  md += '\n## Exercises\n\n';

  for (const exercise of workout.exercises) {
    md += `### ${exercise.name}\n`;

    exercise.sets.forEach((set, idx) => {
      const weight = set.weight ? `${set.weight}kg × ` : 'Bodyweight × ';
      const rpe = set.rpe ? ` (RPE ${set.rpe})` : '';
      md += `- Set ${idx + 1}: ${weight}${set.reps} reps${rpe}\n`;
    });

    if (exercise.notes) {
      md += `\n*${exercise.notes}*\n`;
    }

    md += '\n';
  }

  if (workout.notes) {
    md += `## Notes\n\n${workout.notes}\n`;
  }

  return md;
}

/**
 * Parse markdown file to workout object
 */
export function markdownToWorkout(id: string, content: string): Workout {
  const lines = content.split('\n');

  const workout: Workout = {
    id,
    user: id.includes('tommi') ? 'tommi' : 'finn',
    date: '',
    exercises: [],
  };

  // Parse header
  const titleMatch = lines[0].match(/# Workout - ([\d-]+) ([\d:]+)/);
  if (titleMatch) {
    workout.date = new Date(`${titleMatch[1]}T${titleMatch[2]}`).toISOString();
  }

  let currentExercise: Exercise | null = null;
  let inNotes = false;
  let notesContent = '';

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('**Duration:**')) {
      const duration = parseInt(line.match(/\d+/)?.[0] || '0');
      workout.duration = duration;
    } else if (line.startsWith('**Type:**')) {
      workout.type = line.replace('**Type:**', '').trim();
    } else if (line.startsWith('### ')) {
      // New exercise
      if (currentExercise) {
        workout.exercises.push(currentExercise);
      }
      currentExercise = {
        name: line.replace('### ', ''),
        sets: [],
      };
    } else if (line.startsWith('- Set ')) {
      // Parse set - handle both weighted and bodyweight exercises
      const weightedMatch = line.match(/- Set \d+: (\d+(?:\.\d+)?)kg × (\d+) reps(?: \(RPE (\d+)\))?/);
      const bodyweightMatch = line.match(/- Set \d+: Bodyweight × (\d+) reps(?: \(RPE (\d+)\))?/);

      if (weightedMatch && currentExercise) {
        currentExercise.sets.push({
          weight: parseFloat(weightedMatch[1]),
          reps: parseInt(weightedMatch[2]),
          rpe: weightedMatch[3] ? parseInt(weightedMatch[3]) : undefined,
        });
      } else if (bodyweightMatch && currentExercise) {
        currentExercise.sets.push({
          reps: parseInt(bodyweightMatch[1]),
          rpe: bodyweightMatch[2] ? parseInt(bodyweightMatch[2]) : undefined,
        });
      }
    } else if (line.startsWith('*') && line.endsWith('*') && currentExercise) {
      // Exercise notes
      currentExercise.notes = line.slice(1, -1);
    } else if (line === '## Notes') {
      inNotes = true;
      if (currentExercise) {
        workout.exercises.push(currentExercise);
        currentExercise = null;
      }
    } else if (inNotes && line) {
      notesContent += line + '\n';
    }
  }

  if (currentExercise) {
    workout.exercises.push(currentExercise);
  }

  if (notesContent) {
    workout.notes = notesContent.trim();
  }

  return workout;
}

/**
 * Save workout to markdown file
 */
export async function saveWorkout(workout: Workout): Promise<void> {
  const userDir = path.join(FITNESS_DIR, workout.user);
  await fs.mkdir(userDir, { recursive: true });

  const filename = `${workout.id}.md`;
  const filepath = path.join(userDir, filename);

  const markdown = workoutToMarkdown(workout);
  await fs.writeFile(filepath, markdown, 'utf-8');
}

/**
 * Load workout from markdown file
 */
export async function loadWorkout(id: string): Promise<Workout | null> {
  const user = id.includes('tommi') ? 'tommi' : 'finn';
  const filepath = path.join(FITNESS_DIR, user, `${id}.md`);

  try {
    const content = await fs.readFile(filepath, 'utf-8');
    return markdownToWorkout(id, content);
  } catch (error) {
    return null;
  }
}

/**
 * List all workouts for a user
 */
export async function listWorkouts(user?: 'tommi' | 'finn'): Promise<Workout[]> {
  const workouts: Workout[] = [];

  const users = user ? [user] : ['tommi', 'finn'];

  for (const u of users) {
    const userDir = path.join(FITNESS_DIR, u);

    try {
      const files = await fs.readdir(userDir);

      for (const file of files) {
        if (file.endsWith('.md')) {
          const id = file.replace('.md', '');
          const workout = await loadWorkout(id);
          if (workout) {
            workouts.push(workout);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist yet, that's okay
      continue;
    }
  }

  // Sort by date descending
  workouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return workouts;
}

/**
 * Calculate workout statistics
 */
export async function calculateStats(user?: 'tommi' | 'finn'): Promise<WorkoutStats> {
  const workouts = await listWorkouts(user);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const thisWeek = workouts.filter(w => new Date(w.date) >= weekAgo).length;
  const thisMonth = workouts.filter(w => new Date(w.date) >= monthAgo).length;

  let totalVolume = 0;
  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      for (const set of exercise.sets) {
        if (set.weight) {
          totalVolume += set.weight * set.reps;
        }
      }
    }
  }

  return {
    totalWorkouts: workouts.length,
    thisWeek,
    thisMonth,
    totalVolume: Math.round(totalVolume),
    lastWorkout: workouts[0]?.date,
  };
}

/**
 * Generate unique workout ID
 */
export function generateWorkoutId(user: 'tommi' | 'finn', date: Date): string {
  const dateStr = date.toISOString().split('T')[0].replace(/-/g, '');
  const timeStr = date.toTimeString().slice(0, 5).replace(':', '');
  return `${dateStr}-${timeStr}-${user}`;
}
