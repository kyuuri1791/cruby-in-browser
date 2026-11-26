// ブラウザ内ビルド用 Web Worker（public/cruby/worker.mjs）とのやり取り
"use client";

export type OutputLine = {
  /** prompt: `$ make` / cmd: make が実行するコマンドと make のメッセージ */
  kind: "prompt" | "cmd" | "stdout" | "stderr" | "crash" | "error";
  text: string;
};

export type RunRequest = {
  /** 編集した C のファイルだけ（{ array: "..." }） */
  sources: Record<string, string>;
  makefile: string;
  /** /work に置くファイル */
  files: Record<string, string>;
  /** true なら make だけ */
  make: boolean;
  /** ruby に渡す引数（make だけの時は null） */
  args: string[] | null;
};

export type RunStatus = "done" | "make-failed" | "error" | "timeout";

export type FileInfo = { size: number; kind: "pie" | "shared" | "object" | "module" | "bitcode" };

// public/cruby/worker.mjs とのやり取りの形を変えたら上げる（古い Worker がブラウザのキャッシュに残らないように）
const WORKER_VERSION = 24;

/** ./ruby の実行の時間制限 */
export const RUN_TIME_LIMIT_MS = 10_000;

class Runner {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private pending: { id: number; onLine: (line: OutputLine) => void; resolve: (s: RunStatus) => void } | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private nextId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private fileListeners = new Set<(files: string[]) => void>();
  private files: string[] | null = null;
  private statWaiters = new Map<number, (info: FileInfo | null) => void>();

  private start() {
    if (this.ready) return this.ready;
    const worker = new Worker(`/cruby/worker.mjs?v=${WORKER_VERSION}`, { type: "module" });
    this.worker = worker;
    // module worker はトップレベルの await が終わるまでメッセージを受け取れないので、ready を待つ
    this.ready = new Promise<void>((resolve, reject) => {
      const onMessage = (e: MessageEvent) => {
        if (e.data?.type !== "ready") return;
        worker.removeEventListener("message", onMessage);
        worker.postMessage({ type: "warmup" });
        resolve();
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", (e) => reject(new Error(e.message || "failed to start the worker")), { once: true });
    });
    worker.addEventListener("message", (e) => this.onMessage(e.data));
    return this.ready;
  }

  /** ページを開いたときに呼んでおくと、素材の読み込みを先に始める */
  warmup() {
    this.start().catch(() => {});
  }

  private onMessage(data: { id?: number; type: string; [k: string]: unknown }) {
    if (data.type === "files") {
      this.files = data.files as string[];
      this.fileListeners.forEach((l) => l(this.files!));
      return;
    }
    if (data.type === "stat-result") {
      this.statWaiters.get(data.reqId as number)?.(data.info as FileInfo | null);
      this.statWaiters.delete(data.reqId as number);
      return;
    }
    const p = this.pending;
    if (!p || data.id !== p.id) return;
    switch (data.type) {
      case "phase":
        // ./ruby が長く動き続けたら（無限ループなど）、Worker ごと止める
        this.timer = setTimeout(() => this.kill(), RUN_TIME_LIMIT_MS);
        break;
      case "cmd":
      case "stdout":
      case "stderr":
      case "crash":
      case "error":
        p.onLine({ kind: data.type, text: String(data.text) });
        if (data.type === "error") this.finish("error");
        break;
      case "make-failed":
        this.finish("make-failed");
        break;
      case "done":
        this.finish("done");
        break;
    }
  }

  private finish(status: RunStatus) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending?.resolve(status);
    this.pending = null;
  }

  run(req: RunRequest, onLine: (line: OutputLine) => void): Promise<RunStatus> {
    const task = this.queue.then(async () => {
      await this.start();
      return new Promise<RunStatus>((resolve) => {
        const id = this.nextId++;
        this.pending = { id, onLine, resolve };
        this.worker!.postMessage({ type: "run", id, ...req });
      });
    });
    this.queue = task.catch(() => {});
    return task;
  }

  /** 仮想ファイルシステムのファイル一覧（本体、lib、.so、.o）が変わったら呼ばれる */
  onFiles(listener: (files: string[]) => void) {
    this.fileListeners.add(listener);
    if (this.files) listener(this.files);
    return () => {
      this.fileListeners.delete(listener);
    };
  }

  /** バイナリのファイルの種類と大きさ */
  async stat(path: string): Promise<FileInfo | null> {
    await this.start();
    const reqId = this.nextId++;
    return new Promise((resolve) => {
      this.statWaiters.set(reqId, resolve);
      this.worker!.postMessage({ type: "stat", reqId, path });
    });
  }

  /** 時間制限を超えた ./ruby を止める。Worker を作り直すので、make が作ったものは消え、次の make で作り直す */
  private kill() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.files = null;
    this.statWaiters.forEach((w) => w(null));
    this.statWaiters.clear();
    this.finish("timeout");
    this.warmup();
  }
}

let runner: Runner | null = null;
export const getRunner = () => (runner ??= new Runner());
