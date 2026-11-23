import { lessons, lessonBySlug } from "@/lib/lessons";
import App from "./components/App";

// 1 画面のアプリ。章は /?lesson=<slug> で選ぶ（省略時は「はじめに」）
export default async function Home({ searchParams }: PageProps<"/">) {
  const { lesson } = await searchParams;
  const slug = typeof lesson === "string" && lessonBySlug(lesson) ? lesson : lessons[0].slug;
  return <App lessons={lessons} initialSlug={slug} />;
}
