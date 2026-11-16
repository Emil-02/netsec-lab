"use client";

import { useEffect } from "react";
import { useProgress } from "@/store/progress-store";

export function ProgressHydrator() {
  useEffect(() => {
    void useProgress.persist.rehydrate();
  }, []);
  return null;
}
