"use client";

import type { ReactNode } from "react";
import { useResizable } from "@/lib/useResizable";

/** 教材（左）と作業台（右）を並べる。教材の幅はドラッグで変えられる */
export default function LessonLayout({ lesson, workbench }: { lesson: ReactNode; workbench: ReactNode }) {
  const width = useResizable(400, 260, 760, "x");
  return (
    <main className="lesson" style={{ ["--lesson-w" as string]: `${width.size}px` }}>
      <div className="lesson-pane">{lesson}</div>
      <div {...width.handleProps} />
      {workbench}
    </main>
  );
}
