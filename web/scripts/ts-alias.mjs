// scripts/ts-alias.mjs — lets the plain-node scripts in this folder import the
// app's TypeScript modules directly.
//
// Two small things are needed for that: Node's built-in type stripping (on by
// default from Node 22.18, so no build step and no esbuild download), and a
// resolver for the "@/…" alias that tsconfig defines and Node knows nothing
// about.
//
// Import this module FIRST, then dynamic-import the modules under test.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// scripts/ lives directly under web/, which is what "@/" points at
const WEB_ROOT = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/").href;

import { existsSync } from "node:fs";

// tsconfig uses "bundler" resolution, so app imports are extensionless — Node
// needs the real filename.
const withExtension = (url) => {
  if (/\.[a-z]+$/i.test(url)) return url;
  for (const ext of [".ts", ".tsx", ".mjs", ".js"]) {
    if (existsSync(fileURLToPath(url + ext))) return url + ext;
  }
  return url;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const target = withExtension(new URL(specifier.slice(2), WEB_ROOT).href);
      return nextResolve(target, context);
    }
    return nextResolve(specifier, context);
  },
});

/** Import an app module by its repo-relative path, e.g. "lib/pubmed.ts". */
export const load = (path) => import(new URL(path, WEB_ROOT).href);
