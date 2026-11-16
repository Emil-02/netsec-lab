import { describe, expect, it } from "vitest";
import { allAvailableLessons, lessonKey } from "./curriculum";
import { labs } from "./labs";
import { lessonContent } from "./lesson-content";

describe("curriculum", () => {
  it("has an MDX file for every available lesson and no orphans", () => {
    const keys = allAvailableLessons().map(({ module, lesson }) => lessonKey(module.slug, lesson.slug));
    expect(keys.filter((k) => !lessonContent[k])).toEqual([]);
    expect(Object.keys(lessonContent).filter((k) => !keys.includes(k))).toEqual([]);
  });

  it("references only existing labs", () => {
    const missing = allAvailableLessons().filter(({ lesson }) => lesson.labId && !labs[lesson.labId]);
    expect(missing).toEqual([]);
  });
});
