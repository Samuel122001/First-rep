# Köra PMI Hub på Replit

Replit visar sidan, alltså samma roll som GitHub Pages har i [SETUP.md](SETUP.md). Inloggningen
(Microsoft 365) och databasen (Firebase) är desamma, så allt som sparas syns för alla, på alla
enheter. Replits egen databas används inte: det är Firebase som ger jobbinloggning, live-synk och
databasreglerna som skyddar datan.

## Vad zip-filen innehåller

| Fil / mapp | Vad den är |
|---|---|
| `.replit` | Talar om för Replit hur appen körs (Run) och publiceras (Deploy) |
| `package.json`, `package-lock.json` | Paket som behövs för att bygga (Preact, esbuild, Firebase) |
| `build.mjs` | Bygger appen till en enda webbsida: `site/index.html` |
| `serve.mjs` | Liten webbserver som visar sidan när du klickar Run |
| `src/` | All kod för appen: vyer, datalager, inloggning, export |
| `firebase.config.json` | Firebase-inställningarna, fylls i i steg 3 |
| `firestore.rules`, `firebase.json` | Databasreglerna, klistras in i Firebase (SETUP.md steg 1.4) |
| `docs/` | Den här guiden och SETUP.md |
| `dev/`, `dist/`, `scripts/`, `seed/` | Testversion utan inloggning, claude.ai-versionen och verktyg för startdata |

Ingen företagsdata finns i filerna. Allt innehåll ligger i databasen.

---

## 1. Lägg in filerna

1. Gå till <https://replit.com> och klicka **Create App**. Välj en mall, **Node.js**, och döp
   appen till t.ex. `pmi-hub`. Använd inte Replit Agent för att skapa appen; koden finns redan.
2. Dra `pmi-hub-replit.zip` till filpanelen (**Files**) till vänster.
3. Öppna **Shell** (under *Tools*) och kör:
   ```
   unzip -o pmi-hub-replit.zip && rm -f pmi-hub-replit.zip index.js
   ```
   Mallens filer ersätts. Den dolda filen `.replit` styr Run-knappen; visa den med
   *Show hidden files* i filpanelens meny.
4. Klicka **Run**. Första gången installeras paketen, vilket tar ungefär en minut. Förhandsvisningen
   visar sedan **Setup needed**. Det är rätt tills Firebase-inställningarna är ifyllda i steg 3.
5. Vill du prova systemet direkt: lägg till `/demo` efter adressen i förhandsvisningen. Den
   versionen har ingen inloggning, och det du gör där sparas bara i din egen webbläsare.

## 2. Firebase och Microsoft

Gör steg 1–3 i [SETUP.md](SETUP.md). Enda skillnaden är steg 3.2, **Authorized domains**: lägg
till Replit-adresserna i stället för `samuel122001.github.io`:

- den publicerade appens adress, t.ex. `pmi-hub-digitaltolk.replit.app` (den får du i steg 4);
- om du vill logga in i förhandsvisningen medan du arbetar: adressen som förhandsvisningen visar
  (slutar på `.replit.dev`).

Skriv bara själva adressen, utan `https://` och utan `/` på slutet.

Öppna förhandsvisningen i en ny flik (pilen ↗ ovanför den) innan du loggar in. Microsofts
inloggningsfönster fungerar inte inne i Replits inbäddade förhandsvisning.

## 3. Fyll i Firebase-inställningarna

Öppna `firebase.config.json` och byt ut alla `REPLACE_ME` mot dina värden:

```json
{
  "firebase": {
    "apiKey": "…",
    "authDomain": "…firebaseapp.com",
    "projectId": "…",
    "appId": "…"
  },
  "microsoftTenantId": "<Directory (tenant) ID från Microsoft Entra>",
  "allowedEmailDomains": ["digitaltolk.com"]
}
```

Värdena kommer från `firebaseConfig` (SETUP.md steg 1.5) och från IT (steg 2.2). De är inte
hemliga; skyddet sitter i inloggningen och databasreglerna. Klistra aldrig in Microsofts *client
secret* här. Den läggs bara in i Firebase.

Klicka **Stop** och sedan **Run**. Nu visas *Sign in with Microsoft*.

## 4. Publicera

1. Klicka **Deploy** (eller **Publish**) uppe till höger och välj **Static**.
2. Build command och Public directory är redan ifyllda från `.replit`
   (`npm install && npm run build:web` och `site`). Ändra dem inte.
3. Välj adress, t.ex. `pmi-hub-digitaltolk`, och klicka **Deploy**.
4. Lägg till adressen (`….replit.app`) under **Authorized domains** i Firebase (steg 2 ovan).
5. Öppna adressen och logga in med ditt jobbkonto.

Efter varje ändring i koden eller i `firebase.config.json`: klicka **Redeploy**. Data påverkas
inte av en ny publicering, den ligger kvar i databasen.

## 5. Flytta över datan

Som [SETUP.md steg 5](SETUP.md#steg-5--flytta-över-datan-från-claudeai-du-några-minuter): ladda
ner en backup i claude.ai-versionen och importera den i den publicerade appen.

---

## Bra att veta

- **Lägg aldrig företagsdata som filer i Replit** (Gantt-Excel, personlistor, backupfiler). Den
  hör hemma i databasen. Gör Repl:en privat om ert Replit-konto tillåter det.
- **Ändra inte `firestore.rules` eller byt databas** om du låter Replits AI ändra koden. Reglerna
  är det som gör att bara DigitalTolk-konton kommer åt datan och att historiken inte kan raderas.
- `npm run build` bygger claude.ai-versionen (`dist/pmi-hub.html`). Den behövs inte på Replit.

## Felsökning

| Det du ser | Orsak och åtgärd |
|---|---|
| *Setup needed* | `firebase.config.json` har kvar `REPLACE_ME`, eller sidan är inte omstartad. Klicka Stop/Run, eller Redeploy för den publicerade appen. |
| *This web address is not yet allowed to sign in* | Adressen saknas under Authorized domains i Firebase (steg 2). |
| Inget händer när du klickar *Sign in* | Förhandsvisningen är inbäddad. Öppna den i en ny flik (↗). |
| Run avbryts med ett `npm`-fel | Kör `npm install` i Shell och klicka Run igen. |
| *Not found* på `/demo` i den publicerade appen | Rätt: testversionen finns bara under Run, inte i den publicerade appen. |
| Övriga inloggningsfel (`AADSTS…`) | Se felsökningstabellen i [SETUP.md](SETUP.md#felsökning). |
