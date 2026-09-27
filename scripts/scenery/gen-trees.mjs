/**
 * ez-tree(MIT)로 나무 모양을 만들어 OBJ로 내보낸다. → build_scenery.py(Blender)가 읽어 GLB로 만든다.
 *
 *   node scripts/scenery/gen-trees.mjs <출력 폴더>
 *
 * ez-tree는 브라우저용이라 텍스처 로딩만 빈 텍스처로 바꿔 Node에서 모양(지오메트리)만 뽑는다.
 * 나무껍질 UV에는 프리셋의 textureScale을 미리 곱해 둔다 (glTF에서 텍스처 반복 설정 없이 쓰려고).
 */

import { register } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as THREE from "three";

// 확장자 없는 import와 .json / 이미지 import를 Node에서 읽을 수 있게
register(
  "data:text/javascript," +
    encodeURIComponent(`
    import { readFileSync } from "node:fs";
    import { fileURLToPath } from "node:url";
    export async function resolve(spec, ctx, next) {
      try {
        return await next(spec, ctx);
      } catch (e) {
        if (spec.startsWith(".") && !/\\.[a-z]+$/.test(spec)) return next(spec + ".js", ctx);
        throw e;
      }
    }
    export async function load(url, ctx, next) {
      if (url.endsWith(".json")) {
        return { format: "module", shortCircuit: true, source: "export default " + readFileSync(fileURLToPath(url), "utf8") };
      }
      if (/\\.(jpg|png)$/.test(url)) {
        return { format: "module", shortCircuit: true, source: "export default " + JSON.stringify(url) };
      }
      return next(url, ctx);
    }
  `)
);

THREE.TextureLoader.prototype.load = () => new THREE.Texture();

const { Tree } = await import("../../node_modules/@dgreenheck/ez-tree/src/lib/index.js");

/** 만들 나무: [파일 이름, 프리셋, 시드] */
const VARIANTS = [
  ["oak_a", "Oak Medium", 35729],
  ["oak_b", "Oak Medium", 8812],
  ["ash_a", "Ash Medium", 1203],
  ["aspen_a", "Aspen Medium", 4417],
  ["pine_a", "Pine Medium", 2290],
  ["pine_b", "Pine Small", 771],
  ["bush_a", "Bush 1", 5150],
  ["bush_b", "Bush 2", 9021],
];

const out = resolve(process.argv[2] ?? "scenery-src/trees");
mkdirSync(out, { recursive: true });

function objBlock(name, geo, uvScale, vOffset) {
  const p = geo.getAttribute("position");
  const n = geo.getAttribute("normal");
  const uv = geo.getAttribute("uv");
  const idx = geo.getIndex();
  const lines = [`o ${name}`];
  for (let i = 0; i < p.count; i++) lines.push(`v ${p.getX(i).toFixed(4)} ${p.getY(i).toFixed(4)} ${p.getZ(i).toFixed(4)}`);
  for (let i = 0; i < n.count; i++) lines.push(`vn ${n.getX(i).toFixed(4)} ${n.getY(i).toFixed(4)} ${n.getZ(i).toFixed(4)}`);
  for (let i = 0; i < uv.count; i++) lines.push(`vt ${(uv.getX(i) * uvScale.x).toFixed(5)} ${(uv.getY(i) * uvScale.y).toFixed(5)}`);
  lines.push(`usemtl ${name}`);
  for (let i = 0; i < idx.count; i += 3) {
    const f = [idx.getX(i), idx.getX(i + 1), idx.getX(i + 2)].map((k) => {
      const j = k + 1 + vOffset;
      return `${j}/${j}/${j}`;
    });
    lines.push(`f ${f.join(" ")}`);
  }
  return { text: lines.join("\n"), count: p.count, tris: idx.count / 3 };
}

const meta = {};
for (const [file, preset, seed] of VARIANTS) {
  const tree = new Tree();
  tree.loadPreset(preset);
  tree.options.seed = seed;
  tree.generate();
  const o = tree.options;
  const scale = o.bark.textureScale ?? { x: 1, y: 1 };
  const branches = objBlock("bark", tree.branchesMesh.geometry, { x: scale.x, y: 1 / scale.y }, 0);
  const leaves = objBlock("leaves", tree.leavesMesh.geometry, { x: 1, y: 1 }, branches.count);
  writeFileSync(join(out, `${file}.obj`), `${branches.text}\n${leaves.text}\n`);
  tree.branchesMesh.geometry.computeBoundingBox();
  tree.leavesMesh.geometry.computeBoundingBox();
  const box = tree.branchesMesh.geometry.boundingBox.union(tree.leavesMesh.geometry.boundingBox);
  meta[file] = {
    preset,
    seed,
    type: o.type,
    bark: { type: o.bark.type, tint: o.bark.tint },
    leaves: { type: o.leaves.type, tint: o.leaves.tint, alphaTest: o.leaves.alphaTest },
    height: box.max.y - box.min.y,
    tris: { bark: branches.tris, leaves: leaves.tris },
  };
  console.log(`✓ ${file} (${preset}) 높이 ${meta[file].height.toFixed(1)} · 삼각형 ${branches.tris} + ${leaves.tris}`);
}
writeFileSync(join(out, "trees.json"), JSON.stringify(meta, null, 2));
