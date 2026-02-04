export interface Exercise {
  name: string;
  sets: Set[];
  notes?: string;
}

export interface Set {
  reps: number;
  weight?: number; // kg, optional for bodyweight
  rpe?: number; // Rate of Perceived Exertion (1-10), optional
}

export interface Workout {
  id: string; // Format: YYYYMMDD-HHMM-user
  user: 'tommi' | 'finn';
  date: string; // ISO 8601
  duration?: number; // minutes
  type?: string; // e.g., "Upper body", "Legs", "Full body"
  exercises: Exercise[];
  notes?: string;
}

export interface WorkoutStats {
  totalWorkouts: number;
  thisWeek: number;
  thisMonth: number;
  totalVolume: number; // Total kg lifted
  lastWorkout?: string; // ISO date
}

export interface CreateWorkoutRequest {
  user: 'tommi' | 'finn';
  date: string;
  duration?: number;
  type?: string;
  exercises: Exercise[];
  notes?: string;
}

export interface UserStats {
  user: 'tommi' | 'finn';
  totalWorkouts: number;
  totalVolume: number;
  favoriteExercises: string[];
  currentStreak: number; // days
}
