import { fileURLToPath, pathToFileURL } from 'node:url';

const cliPath = fileURLToPath(new URL('../node_modules/vercel/dist/vc.js', import.meta.url));
const cliArgs = process.argv.slice(2);
const token = process.env.VERCEL_TOKEN;

if (token) cliArgs.push('--token', token);
delete process.env.VERCEL_TOKEN;
process.argv = [process.execPath, cliPath, ...cliArgs];

await import(pathToFileURL(cliPath).href);