"use client";

import Link from "next/link";

/** サイト名。クリックで「はじめに」に戻る（ページは読み込み直さず、書き換えた内容は残す） */
export default function SiteTitle() {
  const goHome = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (window.location.search) window.history.pushState(null, "", "/");
    // App は popstate で URL から章を選び直す
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  return <Link href="/" className="site-title" onClick={goHome}>ブラウザで CRuby</Link>;
}
