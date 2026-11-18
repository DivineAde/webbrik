import { runBench } from "./bench";
runBench().then((r) => {
  const w = Math.max(...r.map((x) => x.name.length));
  for (const x of r) console.log(`${x.name.padEnd(w)}  ${x.ms.toFixed(1).padStart(9)} ms${x.detail ? "  " + x.detail : ""}`);
  console.log(`\nnode ${process.version}, ${process.platform}/${process.arch}`);
  process.exit(0);
});
