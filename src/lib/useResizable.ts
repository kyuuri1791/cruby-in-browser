"use client";

import { useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";

/**
 * ドラッグで大きさを変えられる区切り線のための状態。
 *   axis: "x" なら横方向（幅）、"y" なら縦方向（高さ）
 *   invert: 区切り線を右（下）へ動かすと小さくなるとき true（下のパネルの高さなど）
 */
export function useResizable(initial: number, min: number, max: number, axis: "x" | "y", invert = false) {
  const [size, setSize] = useState(initial);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
      const start = axis === "x" ? e.clientX : e.clientY;
      const startSize = size;
      setDragging(true);
      document.body.classList.add(axis === "x" ? "resizing-x" : "resizing-y");
      const move = (ev: PointerEvent) => {
        const d = (axis === "x" ? ev.clientX : ev.clientY) - start;
        setSize(Math.round(Math.min(max, Math.max(min, startSize + (invert ? -d : d)))));
      };
      const up = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", up);
        handle.removeEventListener("pointercancel", up);
        setDragging(false);
        document.body.classList.remove("resizing-x", "resizing-y");
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
      handle.addEventListener("pointercancel", up);
    },
    [axis, invert, max, min, size],
  );

  /** ダブルクリックで最初の大きさに戻す */
  const reset = useCallback(() => setSize(initial), [initial]);

  const handleProps = {
    onPointerDown,
    onDoubleClick: reset,
    role: "separator" as const,
    "aria-orientation": (axis === "x" ? "vertical" : "horizontal") as "vertical" | "horizontal",
    className: `splitter splitter-${axis}${dragging ? " dragging" : ""}`,
    title: "ドラッグで大きさを変える（ダブルクリックで元に戻す）",
  };
  return { size, handleProps };
}
