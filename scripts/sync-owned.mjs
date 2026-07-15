// Synchronise les pals possédés depuis le serveur Palworld (SFTP).
//
// 1. Télécharge Level.sav depuis le serveur (config : sync-config.json)
// 2. L'extrait en JSON via scripts/extract-pals.py (palworld-save-tools)
// 3. Mappe les identifiants du jeu vers les données de l'app
// 4. Écrit public/owned.json, chargé par l'onglet « Chemin »
//
// Usage :
//   npm run sync-owned
//
// Config : sync-config.json (voir sync-config.example.json), ou variables
// d'environnement (mode conteneur) : SFTP_HOST, SFTP_PORT, SFTP_USER,
// SFTP_PASSWORD (ou SFTP_KEY_PATH), REMOTE_SAVE_PATH, OWNED_OUTPUT_PATH.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import SftpClient from "ssh2-sftp-client";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "sync-config.json");
const cacheDir = path.join(root, ".cache");
const savPath = path.join(cacheDir, "Level.sav");
const rawJsonPath = path.join(cacheDir, "owned-raw.json");
const outPath =
  process.env.OWNED_OUTPUT_PATH ?? path.join(root, "public", "owned.json");

let config;
if (process.env.SFTP_HOST) {
  config = {
    host: process.env.SFTP_HOST,
    port: Number(process.env.SFTP_PORT ?? 22),
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASSWORD || undefined,
    privateKeyPath: process.env.SFTP_KEY_PATH || null,
    remoteSavePath: process.env.REMOTE_SAVE_PATH,
  };
} else if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} else {
  console.error(
    "Aucune configuration : renseigne sync-config.json (copie de " +
      "sync-config.example.json) ou les variables d'environnement SFTP_*."
  );
  process.exit(1);
}

fs.mkdirSync(cacheDir, { recursive: true });

// ---- 1. Téléchargement SFTP --------------------------------------------------

console.log(`Connexion SFTP à ${config.host}:${config.port ?? 22}…`);
const sftp = new SftpClient();
await sftp.connect({
  host: config.host,
  port: config.port ?? 22,
  username: config.username,
  password: config.password,
  privateKey: config.privateKeyPath
    ? fs.readFileSync(config.privateKeyPath)
    : undefined,
});
const playersDir = path.join(cacheDir, "Players");
try {
  const stat = await sftp.stat(config.remoteSavePath);
  console.log(
    `Téléchargement de ${config.remoteSavePath} ` +
      `(${(stat.size / 1024 / 1024).toFixed(1)} Mo, modifié le ${new Date(stat.modifyTime).toLocaleString("fr-FR")})…`
  );
  await sftp.fastGet(config.remoteSavePath, savPath);

  // Sauvegardes des joueurs (conteneurs équipe/palbox pour la localisation).
  const remotePlayersDir =
    config.remoteSavePath.replace(/\/[^/]+$/, "") + "/Players";
  fs.rmSync(playersDir, { recursive: true, force: true });
  fs.mkdirSync(playersDir, { recursive: true });
  try {
    const entries = await sftp.list(remotePlayersDir);
    const savs = entries.filter(
      (e) => e.type === "-" && e.name.toLowerCase().endsWith(".sav")
    );
    console.log(`Téléchargement de ${savs.length} sauvegarde(s) joueur…`);
    for (const e of savs) {
      await sftp.fastGet(
        `${remotePlayersDir}/${e.name}`,
        path.join(playersDir, e.name)
      );
    }
  } catch (err) {
    console.warn(
      `Dossier Players inaccessible (${err.message}) : localisations limitées aux bases.`
    );
  }
} finally {
  await sftp.end();
}

// ---- 2. Extraction Python -----------------------------------------------------

console.log("Extraction des pals (palworld-save-tools)…");
const pythonCmds = ["py", "python3", "python"];
let extracted = false;
for (const cmd of pythonCmds) {
  const run = spawnSync(
    cmd,
    [
      path.join(root, "scripts", "extract-pals.py"),
      savPath,
      rawJsonPath,
      playersDir,
    ],
    { stdio: ["ignore", "inherit", "inherit"] }
  );
  if (run.error) continue; // interpréteur absent, essayer le suivant
  if (run.status !== 0) process.exit(run.status ?? 1);
  extracted = true;
  break;
}
if (!extracted) {
  console.error(
    "Python introuvable (py/python3/python). Installe Python puis : " +
      "py -m pip install palworld-save-tools"
  );
  process.exit(1);
}

// ---- 3. Mapping vers les données de l'app --------------------------------------

const raw = JSON.parse(fs.readFileSync(rawJsonPath, "utf8"));
const appPals = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "pals.json"), "utf8")
);
const appPassives = JSON.parse(
  fs.readFileSync(path.join(root, "src", "data", "passives.json"), "utf8")
);

const palByLowerId = new Map(appPals.map((p) => [p.id.toLowerCase(), p.id]));
const passiveIds = new Set(appPassives.map((p) => p.id));

// Les alphas et pals spéciaux sont préfixés dans les sauvegardes.
function resolvePalId(characterId) {
  const cleaned = characterId.replace(/^(BOSS|PREDATOR|RAID|SUMMON|GYM)_/i, "");
  return (
    palByLowerId.get(characterId.toLowerCase()) ??
    palByLowerId.get(cleaned.toLowerCase()) ??
    null
  );
}

// Localisation : conteneur -> libellé lisible.
const locationByContainer = new Map();
for (const [uid, c] of Object.entries(raw.playerContainers ?? {})) {
  const playerName = raw.players.find((p) => p.uid === uid)?.name ?? "?";
  if (c.party) locationByContainer.set(c.party, `Équipe (${playerName})`);
  if (c.box) locationByContainer.set(c.box, `Palbox (${playerName})`);
}
(raw.bases ?? []).forEach((base, k) => {
  locationByContainer.set(base.container, base.name ?? `Base ${k + 1}`);
});

const byOwner = new Map();
const unmatched = new Map();

for (const pal of raw.pals) {
  const id = resolvePalId(pal.characterId);
  if (!id) {
    unmatched.set(pal.characterId, (unmatched.get(pal.characterId) ?? 0) + 1);
    continue;
  }
  if (!byOwner.has(pal.owner)) byOwner.set(pal.owner, []);
  byOwner.get(pal.owner).push({
    id,
    gender: pal.gender === "MALE" || pal.gender === "FEMALE" ? pal.gender : null,
    level: pal.level,
    ivs: pal.ivs ?? null,
    nickname: pal.nickname ?? null,
    location: locationByContainer.get(pal.container) ?? null,
    passives: pal.passives.filter((s) => passiveIds.has(s)),
  });
}

const players = raw.players
  .map((p) => ({
    uid: p.uid,
    name: p.name,
    pals: byOwner.get(p.uid) ?? [],
  }))
  .filter((p) => p.pals.length > 0);

// Pals dont le propriétaire n'est pas (ou plus) un joueur connu.
const knownUids = new Set(raw.players.map((p) => p.uid));
const orphans = [...byOwner.entries()]
  .filter(([uid]) => !knownUids.has(uid))
  .flatMap(([, list]) => list);
if (orphans.length > 0) {
  players.push({ uid: "orphans", name: "(anciens joueurs)", pals: orphans });
}

if (unmatched.size > 0) {
  console.warn("Identifiants non reconnus (ignorés) :");
  for (const [cid, count] of unmatched) console.warn(`  ${cid} ×${count}`);
}

// ---- 4. Écriture ------------------------------------------------------------------

const result = { generatedAt: new Date().toISOString(), players };
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result));

for (const p of players) console.log(`  ${p.name} : ${p.pals.length} pals`);
console.log(`Écrit dans ${outPath}`);
