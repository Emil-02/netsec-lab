"use client";

import { CircleCheck, CircleX, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProgress } from "@/store/progress-store";

export interface QuizQuestion {
  q: string;
  options: string[];
  answer: number;
  explanation?: string;
}

export function Quiz({ id, questions }: { id: string; questions: QuizQuestion[] }) {
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [submitted, setSubmitted] = useState(false);
  const saveQuiz = useProgress((s) => s.saveQuiz);
  const best = useProgress((s) => s.quizzes[id]);
  const correct = picked.filter((p, i) => p === questions[i].answer).length;

  const submit = () => {
    setSubmitted(true);
    saveQuiz(id, correct, questions.length);
  };

  return (
    <div className="not-prose my-8 rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-bold text-white">🧠 Kuis Singkat</h3>
        {best && <span className="text-xs text-muted">Skor terbaik: {best.correct}/{best.total}</span>}
      </div>
      <ol className="space-y-5">
        {questions.map((question, qi) => (
          <li key={qi}>
            <p className="mb-2 text-sm font-medium text-slate-100">
              {qi + 1}. {question.q}
            </p>
            <div className="grid gap-2">
              {question.options.map((opt, oi) => {
                const chosen = picked[qi] === oi;
                const isAnswer = question.answer === oi;
                return (
                  <button
                    key={oi}
                    disabled={submitted}
                    onClick={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      !submitted && (chosen ? "border-accent bg-accent/10 text-white" : "border-border bg-surface-2/50 text-slate-300 hover:border-slate-500"),
                      submitted && isAnswer && "border-emerald-500/60 bg-emerald-500/10 text-emerald-100",
                      submitted && chosen && !isAnswer && "border-red-500/60 bg-red-500/10 text-red-100",
                      submitted && !chosen && !isAnswer && "border-border text-slate-500",
                    )}
                  >
                    {submitted && isAnswer && <CircleCheck className="size-4 shrink-0 text-emerald-300" />}
                    {submitted && chosen && !isAnswer && <CircleX className="size-4 shrink-0 text-red-300" />}
                    {opt}
                  </button>
                );
              })}
            </div>
            {submitted && question.explanation && <p className="mt-2 text-xs leading-relaxed text-muted">💡 {question.explanation}</p>}
          </li>
        ))}
      </ol>
      <div className="mt-5 flex items-center justify-between gap-3">
        {submitted ? (
          <>
            <p className={cn("text-sm font-semibold", correct === questions.length ? "text-accent" : "text-amber-300")}>
              Skor kamu: {correct}/{questions.length} {correct === questions.length ? "— sempurna! 🎉" : ""}
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSubmitted(false);
                setPicked(questions.map(() => null));
              }}
            >
              <RotateCcw className="size-4" /> Ulangi
            </Button>
          </>
        ) : (
          <Button onClick={submit} disabled={picked.some((p) => p === null)}>
            Periksa Jawaban
          </Button>
        )}
      </div>
    </div>
  );
}
