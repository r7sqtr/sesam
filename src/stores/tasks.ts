import { create } from "zustand";
import type { TaskInfo } from "../types";

interface TasksState {
  tasks: TaskInfo[];
  upsert: (task: TaskInfo) => void;
  patch: (id: number, patch: Partial<TaskInfo>) => void;
  remove: (id: number) => void;
}

export const useTasksStore = create<TasksState>((set) => ({
  tasks: [],
  upsert: (task) =>
    set((state) => ({
      tasks: [...state.tasks.filter((t) => t.id !== task.id), task],
    })),
  patch: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  remove: (id) =>
    set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
}));
