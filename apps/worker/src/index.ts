import "./load-env"; // must stay first: loads .env before anything reads process.env
import { Queue, Worker } from "bullmq";
import { processBuildJob, type BuildJob } from "./build-job";

const token = process.env.WORKER_TOKEN;
if (!token) throw new Error("WORKER_TOKEN must be set (the same value the API uses to authenticate the worker)");
const api = { baseUrl: process.env.API_URL ?? "http://localhost:4000", token };
const connection = { url: process.env.REDIS_URL ?? "redis://localhost:6379" };
export const buildQueue = new Queue<BuildJob>("builds", { connection });

new Worker<BuildJob>("builds", async (job) => { const r = await processBuildJob(job.data, api); return { ok: r.ok, revision: r.revision, files: Object.keys(r.files).length }; }, { connection, concurrency: 4 });
console.log(`worker listening on queue: builds (API ${api.baseUrl})`);
