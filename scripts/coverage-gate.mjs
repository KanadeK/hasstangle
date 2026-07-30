import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["--test", "--experimental-test-coverage"],
  {
    encoding: "utf8",
    env: process.env,
  },
);
process.stdout.write(result.stdout);
process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const match = result.stdout.match(
  /all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/i,
);
if (!match) {
  throw new Error("Could not parse Node.js coverage summary");
}
const actual = {
  lines: Number(match[1]),
  branches: Number(match[2]),
  functions: Number(match[3]),
};
const minimum = { lines: 80, branches: 65, functions: 80 };
const failures = Object.entries(minimum)
  .filter(([name, threshold]) => actual[name] < threshold)
  .map(
    ([name, threshold]) =>
      `${name} ${actual[name].toFixed(2)}% is below ${threshold}%`,
  );
if (failures.length > 0) {
  throw new Error(`Coverage gate failed: ${failures.join("; ")}`);
}
console.log(
  `Coverage gate passed: ${actual.lines}% lines, ` +
    `${actual.branches}% branches, ${actual.functions}% functions.`,
);
