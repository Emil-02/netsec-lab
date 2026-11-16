"use client";

import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

export const LESSON_XP = 10;
export const QUIZ_XP_PER_CORRECT = 5;

const LEVELS = [
  { min: 0, title: "Pemula" },
  { min: 100, title: "Penjelajah" },
  { min: 300, title: "Teknisi Jaringan" },
  { min: 600, title: "Analis Keamanan" },
  { min: 1000, title: "Defender" },
  { min: 1500, title: "Pentester" },
  { min: 2200, title: "Elite Hacker (Etis)" },
];

export function levelFor(xp: number) {
  let idx = 0;
  LEVELS.forEach((l, i) => {
    if (xp >= l.min) idx = i;
  });
  const next = LEVELS[idx + 1];
  const current = LEVELS[idx];
  return {
    level: idx + 1,
    title: current.title,
    nextAt: next?.min ?? null,
    progress: next ? ((xp - current.min) / (next.min - current.min)) * 100 : 100,
  };
}

const noopStorage: StateStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

interface ProgressState {
  lessons: Record<string, number>;
  labs: Record<string, { completedAt: number; xp: number }>;
  quizzes: Record<string, { correct: number; total: number }>;
  hydrated: boolean;
  completeLesson(key: string): void;
  completeLab(id: string, xp: number): void;
  saveQuiz(id: string, correct: number, total: number): void;
  reset(): void;
}

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      lessons: {},
      labs: {},
      quizzes: {},
      hydrated: false,
      completeLesson: (key) => set((s) => (s.lessons[key] ? s : { lessons: { ...s.lessons, [key]: Date.now() } })),
      completeLab: (id, xp) => set((s) => (s.labs[id] ? s : { labs: { ...s.labs, [id]: { completedAt: Date.now(), xp } } })),
      saveQuiz: (id, correct, total) =>
        set((s) => {
          const prev = s.quizzes[id];
          if (prev && prev.correct >= correct) return s;
          return { quizzes: { ...s.quizzes, [id]: { correct, total } } };
        }),
      reset: () => set({ lessons: {}, labs: {}, quizzes: {} }),
    }),
    {
      name: "netsec-progress",
      storage: createJSONStorage(() => (typeof window === "undefined" ? noopStorage : window.localStorage)),
      skipHydration: true,
      partialize: ({ lessons, labs, quizzes }) => ({ lessons, labs, quizzes }),
      onRehydrateStorage: () => () => useProgress.setState({ hydrated: true }),
    },
  ),
);

export function totalXp(s: Pick<ProgressState, "lessons" | "labs" | "quizzes">) {
  return (
    Object.keys(s.lessons).length * LESSON_XP +
    Object.values(s.labs).reduce((sum, l) => sum + l.xp, 0) +
    Object.values(s.quizzes).reduce((sum, q) => sum + q.correct * QUIZ_XP_PER_CORRECT, 0)
  );
}

export function useXp() {
  return useProgress((s) => totalXp(s));
}
