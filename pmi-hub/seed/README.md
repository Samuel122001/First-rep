# Seed data (local only)

Real company data never goes into this repository. Keep generated seed files
here under names that git ignores:

- `employees.local.txt` – the employee list, one name per line
- `mapping.local.json` – optional name mapping for the import script
- `local-seed.json` – output of `scripts/excel_to_seed.py`; also used by `npm run dev`
