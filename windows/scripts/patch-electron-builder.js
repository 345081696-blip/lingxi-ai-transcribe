// 构建期补丁：electron-builder 26.x 的 blockmap.js 写死
//   require("@noble/hashes/blake2.js")
// 但 @noble/hashes 1.3.x（CJS，与 electron-builder 兼容）只暴露子路径 ./blake2b
// （default 指向 CJS 的 ./blake2b.js），并没有 ./blake2.js，导致 require 失败；
// 2.x 虽然有 ./blake2.js 但是纯 ESM，require 会 ERR_REQUIRE_ESM。
// 因此这里把所有 `@noble/hashes/blake2.js` 改写为 `@noble/hashes/blake2b`，
// 配合 package.json 的 overrides 把 @noble/hashes 锁到 1.3.3（CJS）即可构建通过。
// 通过 postinstall 触发，保证 `npm install` 后自动重打，不依赖手工修改 node_modules。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const baseDir = path.join(root, 'node_modules', 'app-builder-lib', 'out');

const BAD = /require\("@noble\/hashes\/blake2\.js"\)/g;
const GOOD = 'require("@noble/hashes/blake2b")';

function walk(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile() && (entry.name.endsWith('.js'))) {
      try {
        const before = fs.readFileSync(full, 'utf8');
        if (BAD.test(before)) {
          const after = before.replace(BAD, GOOD);
          fs.writeFileSync(full, after);
          console.log('[patch] 已修正: ' + path.relative(root, full));
        }
      } catch (_e) {
        /* 跳过无法读取的文件 */
      }
    }
  }
}

if (fs.existsSync(baseDir)) {
  walk(baseDir);
  console.log('[patch] app-builder-lib/out 扫描完成。');
} else {
  console.log('[patch] 未找到 ' + path.relative(root, baseDir) + '，跳过（可能尚未安装 electron-builder）。');
}
