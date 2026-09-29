/*
 * Directory-entry shim for `node --test <this directory>`.
 *
 * Node 20 scans the directory and runs every *.test.js itself, so this file must stay inert there
 * (its argv[1] is this file). Node 22+ treats the positional argument as a file path and resolves
 * the directory to this index.js, so only then do we import the suites.
 */
const entry = String(process.argv[1] || '');
if (!/index\.js$/.test(entry)) {
  await import('./worker.test.js');
  await import('./core.test.js');
}
