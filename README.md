# Kasboek

Een webapp die Rabobank-rekeningafschriften (PDF) leest en laat zien waar je geld naartoe gaat: saldo, inkomsten, soorten kosten, vaste lasten en eigen regels.

Deze repository bevat **alleen de app**, geen persoonlijke gegevens. De app draait via GitHub Pages.

## Waar staan de gegevens?

In een aparte, **privé** repository (bijvoorbeeld `kasboek-data`):

- `afschriften/` met de PDF-afschriften
- `kasboek.json` met regels, eigen soorten kosten, inkomsten en trefwoorden

De app haalt die op via de GitHub API, met een toegangssleutel die alleen op je eigen apparaat wordt bewaard.

## Aanpassen

De broncode staat in `src/`. Na een wijziging:

```
node build.js
```

Dat maakt een nieuwe `index.html`. Commit en push die; GitHub Pages zet hem binnen een minuut online.
