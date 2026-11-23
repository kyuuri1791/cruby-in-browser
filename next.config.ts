import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ロリポップ！デプロイナウでは standalone 出力が必須
  output: "standalone",
  devIndicators: false,
  // next/image は使わないので、画像の最適化に使う sharp を standalone 出力に入れない（デプロイの大きさを抑える）
  images: { unoptimized: true },
  outputFileTracingExcludes: { "*": ["node_modules/sharp/**", "node_modules/@img/**"] },
  // 開発サーバーを http://127.0.0.1:3123 で開いても、開発用の JS や HMR を弾かないようにする
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Worker や Ruby の素材は作り直すことがあるので、毎回サーバーに更新を確かめさせる
        // （変わっていなければ 304 が返るだけなので、大きなファイルを毎回落とすことはない）
        source: "/cruby/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

export default nextConfig;
