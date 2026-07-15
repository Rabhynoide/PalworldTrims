# Palworld Breeding — Calculateur de reproduction

Application web (React + Vite + TypeScript) pour calculer les reproductions
dans Palworld (données à jour pour la version 1.0, juillet 2026).

## Fonctionnalités

- **Enfant** : sélectionner deux parents et voir l'enfant produit
  (combos genrés gérés, ex. Katress ♀ × Wixen ♂ → Katress Ignis).
- **Parents** : lister toutes les paires de parents produisant un pal cible.
- **Chemin** : depuis les pals possédés (importés du serveur avec passifs,
  genre, niveau, IVs et surnom), planifier les croisements les moins coûteux
  en œufs pour un pal cible avec 0 à 4 passifs souhaités — vue arbre
  généalogique ou liste, presets de passifs, contraintes de genre signalées,
  estimation de temps configurable (min/œuf).
- **Passifs** : calculer la probabilité de transmettre les talents passifs
  souhaités à l'enfant.

## Démarrage

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` — serveur de développement
- `npm run build` — build de production (avec vérification des types)
- `npm test` — tests de fumée de la logique de breeding
- `npm run gen-data` — régénère `src/data/*.json` depuis les exports du jeu
- `npm run sync-owned` — récupère les pals possédés depuis le serveur (SFTP)

## Synchroniser les pals possédés depuis un serveur

L'onglet « Chemin » peut pré-remplir « Mes pals » avec le contenu réel du
serveur. Prérequis (une fois) :

```bash
py -m pip install palworld-save-tools pyooz
cp sync-config.example.json sync-config.json   # puis renseigner les accès
```

(`pyooz` fournit la décompression Oodle : depuis la 1.0, les sauvegardes
utilisent le format `PlM` compressé en Oodle au lieu de `PlZ`/zlib.)

`sync-config.json` (non versionné) contient l'hôte SFTP, l'utilisateur, le
mot de passe (ou `privateKeyPath`) et `remoteSavePath`, le chemin du
`Level.sav` du monde sur le serveur
(`…/Pal/Saved/SaveGames/0/<id-du-monde>/Level.sav`).

Ensuite, à chaque fois que tu veux rafraîchir :

```bash
npm run sync-owned
```

Le script télécharge la sauvegarde, en extrait les pals de chaque joueur
(avec genre, niveau et passifs) et écrit `public/owned.json` (non versionné),
que l'app charge automatiquement : un bandeau apparaît dans l'onglet
« Chemin » pour importer les pals d'un joueur en un clic.

## Déploiement Docker / Portainer

La stack (`docker-compose.yml`) contient deux services :

- **web** : le site statique (build Vite multi-étapes, servi par nginx)
- **sync** : synchronise les pals possédés depuis le serveur Palworld en
  SFTP à intervalle régulier (`SYNC_INTERVAL_MINUTES`, 60 min par défaut)
  et écrit `owned.json` dans un volume partagé servi par nginx

En ligne de commande :

```bash
SFTP_HOST=... SFTP_PORT=... SFTP_USER=... SFTP_PASSWORD=... \
REMOTE_SAVE_PATH=/Pal/Saved/SaveGames/0/<id>/Level.sav \
docker compose up -d --build
```

Via Portainer : Stacks → Add stack → **Repository** (URL du dépôt Git,
compose path `docker-compose.yml`), puis renseigner les variables
d'environnement (`SFTP_HOST`, `SFTP_PORT`, `SFTP_USER`, `SFTP_PASSWORD`,
`REMOTE_SAVE_PATH`, `SYNC_INTERVAL_MINUTES`) dans l'interface — jamais dans
le dépôt. Le site sort sur le port `WEB_PORT` (8080 par défaut).

Après une mise à jour du jeu (nouveaux exports + `npm run gen-data`),
reconstruire la stack (Portainer : « Pull and redeploy » / re-build).

## Données : extraites directement du jeu

Les données (`src/data/*.json`) sont générées depuis les fichiers du jeu,
exportés en JSON avec [FModel](https://fmodel.app) dans `ExportedData/` :

| Table | Contenu |
|---|---|
| `Pal/DataTable/Character/DT_PalMonsterParameter.json` | pals, CombiRank, genre, éléments |
| `Pal/DataTable/Character/DT_PalCombiUnique.json` | combos uniques |
| `Pal/DataTable/PassiveSkill/DT_PassiveSkill_Main.json` | talents passifs |
| `L10N/fr/Pal/DataTable/Text/DT_PalNameText_Common.json` | noms des pals (FR) |
| `L10N/fr/Pal/DataTable/Text/DT_SkillNameText_Common.json` | noms des passifs (FR) |
| `L10N/fr/Pal/DataTable/Text/DT_SkillDescText_Common.json` | descriptions des passifs (FR) |

Optionnel : exporter aussi `L10N/en/...` pour des noms anglais exacts dans la
recherche (sinon repli sur le texte source des fichiers FR).

### Après une mise à jour du jeu

1. Mettre à jour le fichier de mappings `.usmap` de FModel
   ([elliotks/Palworld-FModel](https://github.com/elliotks/Palworld-FModel)).
2. Ré-exporter les tables ci-dessus dans `ExportedData/`.
3. `npm run gen-data`

### Logique de breeding

L'enfant d'un croisement est calculé comme dans le jeu :

1. deux parents de même espèce donnent la même espèce ;
2. les paires de `DT_PalCombiUnique` donnent leur enfant unique
   (certaines dépendent du genre des parents) ;
3. sinon, rang cible = `(rang1 + rang2 + 1) / 2`, et l'enfant est le
   candidat au `CombiRank` le plus proche — les candidats étant les pals
   `IgnoreCombi = false` qui ne sont pas enfants d'un combo unique ;
   à rang égal, `CombiDuplicatePriority` le plus bas gagne.

Cette logique reproduit à l'identique les 44 850 paires de la table de
référence de [PalCalc](https://github.com/tylercamp/palcalc) (validation
effectuée lors de la migration).

Non affilié à Pocketpair. Les exports `ExportedData/` proviennent de votre
propre copie du jeu et n'ont pas vocation à être redistribués.
