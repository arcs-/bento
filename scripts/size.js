import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const bundlePath = "dist/bento.js";
const budgetBytes = 10000;

const minifiedBytes = readFileSync(bundlePath);
const gzippedByteCount = gzipSync(minifiedBytes, { level: 9 }).byteLength;
const budgetShare = Math.round((gzippedByteCount / budgetBytes) * 100);

console.log(
  `${bundlePath}: ${minifiedBytes.byteLength} B min, ${gzippedByteCount} B min+gzip, ${budgetShare}% of the ${budgetBytes} B budget`,
);
