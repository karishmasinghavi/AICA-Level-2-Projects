import { mkdir, copyFile, cp } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(.:)/, '$1');
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });
await copyFile(join(root, 'index.html'), join(dist, 'index.html'));
await copyFile(join(root, 'styles.css'), join(dist, 'styles.css'));
await copyFile(join(root, 'ui-additions.css'), join(dist, 'ui-additions.css'));
await copyFile(join(root, 'premium.css'), join(dist, 'premium.css'));
await copyFile(join(root, 'team.css'), join(dist, 'team.css'));
await cp(join(root, 'src'), join(dist, 'src'), { recursive: true, force: true });
await cp(join(root, 'assets'), join(dist, 'assets'), { recursive: true, force: true });
console.log('Static site ready in dist/');
