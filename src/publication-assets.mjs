/** Selected publication bytes. This owner never fetches or copies a directory. */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

/** Receive one same-origin asset beneath the admitted content root.
 * The selecting domain supplies its accepted extensions and byte bound.
 */
export function readPublicationAsset(value, { origin, contentRoot, extensions, maxBytes = Infinity, label = "Publication assets", kind = "asset" }) {
  const refuse = () => { throw new TypeError(`${label} require an existing same-origin ${kind} inside /assets/`); };
  if (typeof value !== "string" || !value || /[\\\s\u0000-\u001f\u007f%]/u.test(value)) refuse();
  let url, home;
  try { home = new URL(origin); url = new URL(value, home); } catch { refuse(); }
  if (home.protocol !== "https:" || url.origin !== home.origin || url.protocol !== "https:" ||
      url.username || url.password || url.search || url.hash || !url.pathname.startsWith("/assets/") ||
      !extensions.includes(path.extname(url.pathname).slice(1).toLowerCase()) ||
      value.split("/").some(part => part === "." || part === "..")) refuse();
  const root = realpathSync(contentRoot), relativePath = url.pathname.slice(1), target = path.resolve(root, relativePath);
  if (!existsSync(target)) refuse();
  const actual = realpathSync(target), relative = path.relative(root, actual);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) refuse();
  const info = statSync(actual);
  if (!info.isFile()) refuse();
  if (info.size > maxBytes) throw new RangeError(`${label} exceed the ${maxBytes}-byte publication asset limit`);
  const bytes = readFileSync(actual);
  if (bytes.length > maxBytes) throw new RangeError(`${label} exceed the ${maxBytes}-byte publication asset limit`);
  return Object.freeze({ path: relativePath, url: url.href, bytes });
}
