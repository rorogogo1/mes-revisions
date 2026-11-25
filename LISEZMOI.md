# Mes révisions

Application web installable (PWA) qui transforme des notes de cours en questions de révision, fait rédiger les réponses par l'étudiant, les compare à ses notes, puis planifie les révisions jusqu'à l'examen (FSRS).

## Lancer l'application sur l'ordinateur

Double-cliquer n'est pas possible (les modules JavaScript exigent un serveur). Dans PowerShell :

```powershell
powershell -ExecutionPolicy Bypass -File .\lancer.ps1
```

L'application s'ouvre sur http://localhost:8080. Dans Chrome ou Edge, l'icône « Installer » de la barre d'adresse l'ajoute comme une application.

## L'installer sur un téléphone Android

Le téléphone a besoin d'une adresse en HTTPS. Le plus simple et gratuit : GitHub Pages.

1. Créer un dépôt GitHub et y déposer le contenu de ce dossier (`index.html` à la racine).
2. Réglages du dépôt › Pages › Source : branche `main`, dossier `/ (root)`.
3. Ouvrir l'adresse `https://<compte>.github.io/<depot>/` dans Chrome sur Android, puis menu ⋮ › « Installer l'application ».

Les données restent sur chaque appareil. Pour passer de l'ordinateur au téléphone : Réglages › Télécharger une sauvegarde, puis Restaurer sur l'autre appareil.

## Clé Gemini

Créer une clé gratuite sur https://aistudio.google.com/apikey et la coller dans Réglages. Sans clé, l'application fonctionne quand même : lecture des photos sur l'appareil (texte imprimé), questions simples (définitions, dates), correction par mots-clés.

## Fonctions

| Étape | Ce que fait l'application |
|---|---|
| Import | Photo (appareil photo), images, PDF (pages scannées comprises), texte collé ou fichier .txt/.md |
| Contrôle | Écran de vérification et de correction du texte lu, avec l'aperçu des pages |
| Génération | Réglages par série : notes/chapitre, difficulté, nombre, langue, formats (question-réponse, texte à trou, notions proches, « pourquoi ? »). Chaque carte est liée au paragraphe source, et la citation est vérifiée dans les notes |
| Rédaction | L'étudiant écrit chaque réponse avec ses mots ; l'application la compare à ses notes (conforme, incomplet, différent) |
| Révision | Question sans choix ; « Je bloque » affiche les choix ou un indice ; bouton Sûr / Pas sûr avant la correction ; explication selon les 4 cas ; pourquoi chaque mauvaise réponse est fausse ; passage des notes cité ; « Pour aller plus loin » via Wikipédia ; signalement d'une carte erronée |
| Planning | FSRS-5, date d'examen par cours, intervalles plafonnés selon le temps restant (environ 20 % du délai à quelques semaines, 5 % à un an), séances mélangeant plusieurs cours et chapitres |
| Export | Anki (.txt importable, un paquet par cours et chapitre), CSV, sauvegarde complète JSON |
| Hors ligne | Service worker : révision, rédaction et lecture sur l'appareil sans connexion |

## Structure

```
index.html, manifest.webmanifest, sw.js, lancer.ps1
css/styles.css
js/app.js          routage
js/db.js           IndexedDB
js/store.js        cours, notes, cartes, révisions
js/fsrs.js         répétition espacée + plafond d'examen
js/queue.js        file de révision entrelacée
js/gemini.js       client API Gemini
js/ai.js           consignes : lecture, génération, comparaison, correction
js/local-ai.js     traitements sans connexion
js/ocr.js          photos (Gemini / Tesseract.js) et PDF (pdf.js)
js/export.js       Anki, CSV, sauvegarde
js/wiki.js         résumé Wikipédia
js/components.js, js/ui.js, js/util.js, js/text.js, js/settings.js, js/pwa.js
js/views/          un fichier par écran
```
