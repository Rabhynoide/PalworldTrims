// Copie les icônes de pals exportées via FModel vers public/icons/pals/,
// nommées par identifiant interne (celui de pals.json).
//
// Usage : node scripts/generate-icons.mjs
// Source attendue : ExportedData/Pal/Texture/PalIcon/**/T_<id>_icon_normal.png

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "ExportedData", "Pal", "Texture", "PalIcon");
const outDir = path.join(root, "public", "icons", "pals");

const pals = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "pals.json"), "utf8")
);

// Index des fichiers d'icônes par identifiant (insensible à la casse).
const iconByLowerId = new Map();
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else {
      const m = entry.name.match(/^T_(.+)_icon_normal\.png$/i);
      if (m) iconByLowerId.set(m[1].toLowerCase(), full);
    }
  }
};
walk(sourceDir);
console.log(`Icônes trouvées : ${iconByLowerId.size}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const missing = [];
let copied = 0;
for (const pal of pals) {
  let source = iconByLowerId.get(pal.id.toLowerCase());
  if (!source && pal.id.includes("_")) {
    // Variante sans icône propre (ex. PlantSlime_Flower) : forme de base.
    source = iconByLowerId.get(pal.id.slice(0, pal.id.lastIndexOf("_")).toLowerCase());
  }
  if (!source) {
    missing.push(pal.id);
    continue;
  }
  fs.copyFileSync(source, path.join(outDir, `${pal.id}.png`));
  copied++;
}

console.log(`Copiées : ${copied}/${pals.length} vers ${outDir}`);
if (missing.length > 0) console.warn(`Sans icône : ${missing.join(", ")}`);
