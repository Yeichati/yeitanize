# Yeitanize

POC React / TypeScript de pseudonymisation réversible, aux couleurs et typographies Yeita.

## Utilisation

1. Importer CSV, JSON, XLS ou XLSX. Pour Excel, choisir la feuille.
2. Sélectionner manuellement les colonnes à retirer et vérifier l'aperçu.
3. Télécharger le fichier pseudonymisé et le mapping. Ne jamais envoyer le mapping à une IA.
4. Demander à l'IA de conserver `anonymized_id` exactement.
5. Réimporter mapping et résultat dans Restaurer, vérifier le bilan puis exporter.

Les fichiers sont traités en mémoire côté navigateur, sans envoi à un serveur, analytics, stockage local ou base de données. Rafraîchir la page efface les données en mémoire. Les ressources de l'interface et polices sont servies localement au site. Le site utilise React avec Vite et une sortie statique.

## Règles du POC

- Une ligne = un identifiant indépendant, préfixe `anon_` et 24 caractères alphanumériques aléatoires via Web Crypto. Casse significative, contrôle d'unicité dans le traitement.
- CSV UTF-8, JSON tabulaire plat, valeurs Excel uniquement. Pas de conservation des styles, formules, macros ou autres feuilles dans les exports.
- Maximum 20 Mo, 100 000 lignes, 500 colonnes. XLS : maximum 65 535 lignes de données et 256 colonnes.
- Les identifiants vides ou dupliqués bloquent la restauration entière ; aucun appariement approximatif.
- Toutes les lignes du mapping sont conservées ; résultats manquants = champs IA vides ; identifiants inconnus exclus avec signalement.
- Les colonnes IA en conflit sont renommées `_ai`, `_ai_2`, etc. Toutes les colonnes du résultat IA sont conservées, même inchangées.
- JSON et XLSX préservent les chaînes pouvant ressembler à des formules. CSV les préfixe d'une apostrophe pour éviter leur exécution à l'ouverture dans un tableur.
- La suppression manuelle de colonnes ne garantit pas l'anonymat des données restantes.

## Développement

Prérequis : Node.js 22.13 ou supérieur.

Depuis le dossier décompressé :

```bash
npm install
npm run dev
```

Ouvrir l’adresse locale affichée dans le terminal. Aucun déploiement n’est lancé.

```bash
npm test
npm run build
npm run preview
```

`dist/` contient également une version déjà compilée. Elle doit être servie via un serveur HTTP local (et non ouverte en double-cliquant sur index.html).

Tests : aller-retour de 100 lignes dans les quatre formats, caractères spéciaux, zéros initiaux, réordonnancement, conflits de colonnes, identifiants inconnus, doublons, sensibilité à la casse, JSON imbriqué et en-têtes dupliqués.

## Déploiement sur GitHub Pages

1. Placer le contenu du dossier `yeitanize` à la racine du dépôt GitHub : `package.json`, `.github/`, `app/`, etc.
2. Dans le dépôt, ouvrir **Settings → Pages → Build and deployment → Source** et choisir **GitHub Actions**.
3. Pousser le code sur la branche `main`. Le workflow `.github/workflows/deploy-pages.yml` installe les dépendances, vérifie les traitements, compile et publie uniquement `dist/`.
4. Suivre l’exécution dans **Actions**. L’adresse du site apparaît à la fin du déploiement et dans **Settings → Pages**.

Si la branche principale a un autre nom, remplacer `main` dans le workflow. Un lancement manuel est aussi possible depuis **Actions → Déployer Yeitanize sur GitHub Pages → Run workflow**.

Les chemins relatifs Vite (`base: './'`) permettent de servir les ressources sous le nom du dépôt ou à la racine d’un domaine. Aucun secret de déploiement à ajouter : le workflow utilise le jeton GitHub prévu à cet effet.

Le `.gitignore` exclut les dépendances, la compilation, les caches, les fichiers d’environnement locaux, les journaux et les fichiers d’éditeur. Conserver `package-lock.json` et `.github/workflows/deploy-pages.yml` dans Git. Si `node_modules` ou `dist` ont déjà été ajoutés au dépôt, les retirer du suivi avec `git rm -r --cached --ignore-unmatch node_modules dist` : le `.gitignore` ne retire pas les fichiers déjà suivis.
