# Palworld Breeding — Calculateur de reproduction

Application web (React + Vite + TypeScript) pour calculer les reproductions
dans Palworld (données à jour pour la version 1.0, juillet 2026).

## Fonctionnalités

- **Enfant** : sélectionner deux parents et voir l'enfant produit
  (combos genrés gérés, ex. Katress ♀ × Wixen ♂ → Katress Ignis).
- **Parents** : lister toutes les paires de parents produisant un pal cible.
- **Chemin** : depuis les pals possédés, trouver la chaîne de croisements
  la plus courte vers un pal cible.
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
- `npm run gen-data` — régénère `src/data/*.json` depuis les datasets
  [PalCalc](https://github.com/tylercamp/palcalc) (à relancer après une
  mise à jour du jeu)

## Données

Les données de jeu (pals, table de breeding, passifs, probabilités de genre)
proviennent du projet [PalCalc](https://github.com/tylercamp/palcalc)
(licence MIT), qui les extrait directement des fichiers du jeu.
Non affilié à Pocketpair.
