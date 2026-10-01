# Sätta upp PMI Hub på GitHub Pages med inloggning via Microsoft 365

**Så här hänger det ihop**

| Del | Tjänst | Vad den gör |
|---|---|---|
| Webbsidan | GitHub Pages | Visar appen på `https://samuel122001.github.io/First-rep/` |
| Inloggning | Firebase Authentication + Microsoft Entra ID | Bara DigitalTolk-konton i er Microsoft 365-katalog kan logga in |
| Data | Cloud Firestore | Allt som sparas: projekt, uppgifter, personer, anteckningar, rapporter, historik |
| Behörighet | `pmi-hub/firestore.rules` | Databasen släpper bara in inloggade konton med DigitalTolk-adress; historiken kan inte ändras eller raderas |

Vill du köra på Replit i stället för GitHub Pages? Följ [REPLIT.md](REPLIT.md); steg 1–3 nedan är desamma.

Ingen data ligger i GitHub-repot. Sidan i sig innehåller bara kod; allt innehåll hämtas från
databasen efter inloggning.

Räkna med ungefär en halvtimme totalt. Steg 2 behöver göras av någon som är administratör i
Microsoft Entra ID (IT).

---

## Steg 1 – Firebase-projekt (du)

1. Gå till <https://console.firebase.google.com> och logga in med ett Google-konto som
   DigitalTolk kontrollerar (helst ett gemensamt/tekniskt konto, inte ett privat).
2. **Create a project** → namn t.ex. `digitaltolk-pmi-hub`. Google Analytics behövs inte.
3. **Build → Firestore Database → Create database**
   - Edition: Standard. Mode: **Production mode**.
   - Location: `europe-north1 (Finland)` eller `eur3 (Europe)`. Platsen kan inte ändras senare.
4. **Firestore → Rules**: ersätt allt med innehållet i [`firestore.rules`](../firestore.rules) och
   klicka **Publish**.
   Har ni fler e-postdomäner än `digitaltolk.com`? Lägg till dem i regeln
   (`'.*@(digitaltolk[.]com|annan[.]se)$'`) och i `allowedEmailDomains` i steg 4.3.
5. **Project settings** (kugghjulet) → **General → Your apps → Web (`</>`)** → registrera appen
   `PMI Hub` (Firebase Hosting behövs inte). Spara värdena i `firebaseConfig`:
   `apiKey`, `authDomain`, `projectId`, `appId`.
6. **Build → Authentication → Get started → Sign-in method → Add new provider → Microsoft** →
   slå på **Enable**. Kopiera **callback URL** som visas
   (`https://<projekt-id>.firebaseapp.com/__/auth/handler`). Låt fönstret vara öppet.

## Steg 2 – App-registrering i Microsoft Entra ID (IT-administratör)

1. <https://entra.microsoft.com> → **Applications → App registrations → New registration**
   - Name: `DigitalTolk PMI Hub`
   - Supported account types: **Accounts in this organizational directory only (Single tenant)**
     – det är detta som gör att bara DigitalTolk-konton kan logga in.
   - Redirect URI: plattform **Web**, värde = callback URL från steg 1.6.
2. **Register**. Kopiera från **Overview**: **Application (client) ID** och
   **Directory (tenant) ID**.
3. **Certificates & secrets → New client secret** → giltighet t.ex. 24 månader → kopiera
   **Value** direkt (det visas bara en gång). Lägg en kalenderpåminnelse om att förnya den innan
   den går ut – annars slutar inloggningen fungera.
4. **API permissions**: `Microsoft Graph → User.Read (Delegated)` finns redan. Om användare i er
   tenant inte själva får godkänna appar: klicka **Grant admin consent for DigitalTolk**.
5. *(Rekommenderas)* **Enterprise applications → DigitalTolk PMI Hub → Properties →
   Assignment required = Yes**, och under **Users and groups** lägg till de personer eller den
   grupp som ska använda PMI Hub. Då kan bara de logga in, inte alla anställda.

## Steg 3 – Koppla ihop Firebase och Microsoft (du)

1. Tillbaka i Firebase, i Microsoft-providern från steg 1.6:
   **Application ID** = client ID, **Application secret** = secret value → **Save**.
2. **Authentication → Settings → Authorized domains → Add domain**: `samuel122001.github.io`

## Steg 4 – GitHub (du)

1. *(Rekommenderas)* Gör repot privat: **Settings → General → Danger Zone → Change visibility**.
   GitHub Pages från ett privat repo kräver GitHub Pro/Team. Koden innehåller inga hemligheter
   eller data, men ett privat repo ger ett extra skydd.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables → New repository variable**
   - Name: `PMI_FIREBASE_CONFIG`
   - Value (fyll i dina värden):
     ```json
     {"firebase":{"apiKey":"…","authDomain":"…firebaseapp.com","projectId":"…","appId":"…"},"microsoftTenantId":"<Directory (tenant) ID>","allowedEmailDomains":["digitaltolk.com"]}
     ```
   Värdena i `firebaseConfig` är inte hemliga; skyddet sitter i inloggningen och databasreglerna.
4. Slå ihop grenen med `main`. Under **Actions** körs då *Deploy PMI Hub to GitHub Pages*, och
   sidan finns sedan på `https://samuel122001.github.io/First-rep/`.

## Steg 5 – Flytta över datan från claude.ai (du, några minuter)

1. Öppna claude.ai-versionen → **Backup** (nere till vänster) → **Download backup**.
2. Öppna GitHub-versionen, logga in → **Import a backup from the claude.ai version** →
   välj filen → **Import**. Alla projekt, personer, anteckningar, rapporter och hela historiken
   följer med, inklusive vem som gjort varje ändring.
3. Kontrollera att allt finns där, och sluta sedan använda claude.ai-versionen så att ändringar
   inte hamnar på två ställen.
4. Backup-filen innehåller konfidentiell information. Radera den eller spara den på en säker plats.

Första gången varje person loggar in kopplas kontot automatiskt till personen med samma namn i
personregistret. Annars väljer man själv under *Choose who you are*.

---

## Kostnad

Gratisplanen (Spark) räcker för ett mindre team: 50 000 läsningar per dag, och en sidladdning
läser ungefär 500 dokument, alltså ungefär 100 sidladdningar per dag. För marginal: byt till
**Blaze** (betala per användning) och sätt ett budgetlarm på t.ex. 50 kr/månad under
**Usage and billing**. Med den här datamängden blir kostnaden i praktiken några kronor i månaden.

## Felsökning

| Meddelande | Orsak och åtgärd |
|---|---|
| *Setup needed* | Variabeln `PMI_FIREBASE_CONFIG` saknas eller har fel format (steg 4.3). Kör om workflowet. |
| *This web address is not yet allowed to sign in* | Lägg till `samuel122001.github.io` under Authorized domains (steg 3.2). |
| *Microsoft sign-in is not switched on* | Microsoft-providern är inte aktiverad eller sparad i Firebase (steg 1.6 / 3.1). |
| Microsoft visar `AADSTS50011` (redirect URI mismatch) | Redirect URI i Entra matchar inte callback URL från Firebase exakt (steg 2.1). |
| Microsoft visar `AADSTS50020` eller att kontot inte finns | Kontot hör inte till DigitalTolks katalog – appen är single tenant med avsikt. |
| Microsoft visar `AADSTS65001` / *Need admin approval* | Admin consent saknas (steg 2.4). |
| Microsoft visar `AADSTS7000222` / *invalid client secret* | Client secret har gått ut eller är fel – skapa en ny och lägg in i Firebase (steg 2.3, 3.1). |
| *No access* efter inloggning | Kontots e-postadress har inte en tillåten domän (steg 1.4 och 4.3). |
