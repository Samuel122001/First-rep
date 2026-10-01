# Flappy Fågel

Ett enkelt webbläsarspel som liknar Flappy Bird, skrivet i vanlig HTML och JavaScript (Canvas). Inget behöver installeras.

## Spela

Öppna `index.html` i en webbläsare. Du kan också starta en lokal server:

```bash
python3 -m http.server 8000
```

och gå sedan till <http://localhost:8000>.

## Styrning

- **Mellanslag**, **pil upp**, **musklick** eller **tryck på skärmen**: flyg uppåt
- Flyg genom öppningarna mellan rören. Varje rör du passerar ger en poäng.
- Om du krockar med ett rör eller marken är spelet slut. Ditt rekord sparas i webbläsaren.

## Filer

- `index.html` – sidan som visar spelet
- `game.js` – spellogik, fysik, kollisioner och ritning

## Justera svårighetsgraden

Överst i `game.js` finns konstanter du kan ändra, till exempel:

- `GRAVITATION` – hur snabbt fågeln faller
- `HOPP_KRAFT` – hur högt fågeln hoppar
- `ROR_GLAPP` – hur stor öppningen mellan rören är
- `ROR_HASTIGHET` – hur fort rören rör sig
