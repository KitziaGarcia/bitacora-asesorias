// vue-tsc resolves `typescript` from the hoisted root (TypeScript 7, which has no JS tsc API).
// Point it at this workspace's TypeScript 5.9 instead.
const tsc = require.resolve('typescript/lib/tsc.js', { paths: [__dirname] });
require('vue-tsc').run(tsc);
