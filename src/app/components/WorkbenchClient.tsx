"use client";

import dynamic from "next/dynamic";

// エディタと Worker はブラウザでしか動かないので、サーバーでは描画しない
const Workbench = dynamic(() => import("./Workbench"), {
  ssr: false,
  loading: () => <div className="wb-loading">エディタを読み込んでいます…</div>,
});

export default Workbench;
