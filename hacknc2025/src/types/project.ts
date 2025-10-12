export interface Project {
  id: string;
  user_id: string;
  name: string;
  grid_data: boolean[][][];
  bpm: number;
  created_at: string;
  updated_at: string;
}

export interface ProjectCreate {
  name: string;
  grid_data: boolean[][][];
  bpm: number;
}

export interface ProjectUpdate {
  name?: string;
  grid_data?: boolean[][][];
  bpm?: number;
}
