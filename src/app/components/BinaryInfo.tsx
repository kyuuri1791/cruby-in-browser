"use client";

import { useEffect, useState } from "react";
import { getRunner, type FileInfo } from "@/lib/runner";

const KIND: Record<FileInfo["kind"], string> = {
  pie: "WebAssembly 実行ファイル（PIE）",
  shared: "WebAssembly 共有ライブラリ",
  object: "オブジェクトファイル",
  module: "WebAssembly モジュール",
  bitcode: "LLVM bitcode",
};

/** バイナリのファイルはテキストでは開かず、種類と大きさだけを出す */
export default function BinaryInfo({ path, version }: { path: string; version: string }) {
  const [state, setState] = useState<{ key: string; info: FileInfo | null } | null>(null);
  const key = `${path}\0${version}`;

  useEffect(() => {
    let alive = true;
    getRunner()
      .stat(path)
      .then((info) => alive && setState({ key, info }));
    return () => {
      alive = false;
    };
  }, [path, key]);

  const info = state?.key === key ? state.info : undefined;
  return (
    <div className="binary-info">
      {info ? (
        <p>
          {KIND[info.kind]}・{info.size.toLocaleString()} バイト
        </p>
      ) : (
        <p className="muted">{info === null ? "ファイルがありません" : "…"}</p>
      )}
    </div>
  );
}
