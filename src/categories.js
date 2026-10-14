// Categorieën en automatische indeling op basis van naam en transactietype.
// Alleen algemene trefwoorden staan hier; eigen trefwoorden komen uit kasboek.json in je privé-repository.
(function (root) {
  const CATEGORIES = [
    { id: 'boodschappen', label: 'Boodschappen', kind: 'uit', color: '#2f7d5b' },
    { id: 'horeca', label: 'Eten & drinken', kind: 'uit', color: '#c4572e' },
    { id: 'koffie', label: 'Koffie & lunch', kind: 'uit', color: '#a8763e' },
    { id: 'vervoer', label: 'Vervoer & tanken', kind: 'uit', color: '#3a6ea5' },
    { id: 'tabak', label: 'Tabak', kind: 'uit', color: '#7a6a58' },
    { id: 'sport', label: 'Sport & golf', kind: 'uit', color: '#5d9c3a' },
    { id: 'uitgaan', label: 'Uitgaan & media', kind: 'uit', color: '#8e4fa3' },
    { id: 'winkelen', label: 'Winkelen', kind: 'uit', color: '#c2417a' },
    { id: 'verzorging', label: 'Verzorging', kind: 'uit', color: '#3d9a9a' },
    { id: 'wonen', label: 'Huur & wonen', kind: 'uit', color: '#4b5a8c' },
    { id: 'vastelasten', label: 'Verzekering & bank', kind: 'uit', color: '#5f7480' },
    { id: 'studie', label: 'Studie & vereniging', kind: 'uit', color: '#b38a1f' },
    { id: 'vrienden', label: 'Tikkies & vrienden', kind: 'uit', color: '#d07a4a' },
    { id: 'boetes', label: 'Boetes & incasso', kind: 'uit', color: '#b33a3a' },
    { id: 'contant', label: 'Contant geld', kind: 'uit', color: '#6d7d55' },
    { id: 'overboeking', label: 'Overboekingen', kind: 'uit', color: '#8a8f99' },
    { id: 'overig', label: 'Overig', kind: 'uit', color: '#a3a7ae' },
    { id: 'salaris', label: 'Salaris', kind: 'in', color: '#2f7d5b' },
    { id: 'duo', label: 'Studiefinanciering', kind: 'in', color: '#3a6ea5' },
    { id: 'toeslag', label: 'Belastingdienst', kind: 'in', color: '#b38a1f' },
    { id: 'inkomen', label: 'Overig inkomen', kind: 'in', color: '#8a8f99' },
    { id: 'eigen', label: 'Eigen rekening', kind: 'eigen', color: '#a3a7ae' },
  ];

  // [categorie, regex] - eerste match wint
  const RULES = [
    ['koffie', /^maas\b|bedrijfsrest|ah to ?go|kiosk|avolta|air ?side|autogrill/],
    ['boodschappen', /albert heijn|^ah\b|jumbo|vomar|dirk v|^plus\b|aldi|lidl|coop\b|incoop|spar\b|ekoplaza|hoogvliet|picnic|slagerij|bakker|marché|feinkost/],
    ['tabak', /tabak|sigar|smoke|hajenius|souvenier/],
    ['vervoer', /^nlov|ov-?chip|\bns\b|ns groep|ns reizigers|nsautomaat|uber|bolt\.eu|taxi|parkeer|fiets|easyjet|klm|transavia|esso|shell|^bp\b|total\b|aral|agip|tankstel|kuster energy|greenwheels|swapfiets|jachthaven|marina|centraal bureau rijvaard|vaarbewijs/],
    ['sport', /golf|hole19|sportcity|basic-?fit/],
    ['uitgaan', /path[eé]|ticket|arena|entertai|podimo|spotify|netflix|disney|videoland|cm\.com|breeze/],
    ['horeca', /caf[eé]|\bbar\b|bar |restau|grill|pub\b|brasserie|eethuis|taproom|mcdonald|febo|subway|^bk \d|snack|cafetaria|frietje|smullers|thuisbezorgd|strandpav|pizza|sushi|bistro|kitchen|deli|toilet/],
    ['verzorging', /barber|kapsalon|kapper|treatwell|etos|kruidvat|apotheek|tandarts|huisarts/],
    ['winkelen', /zalando|bol\.?com|bolcom|vinted|marktplaats|temu|ikea|action|hema|kringloop|vintage|primark|h&m|coolblue|mediamarkt|apple|amazon|stripe/],
    ['vastelasten', /interpolis|centraal beheer|zilveren kruis|cz\b|vgz|menzis|ziggo|kpn|odido|vattenfall|eneco|essent|waternet|^rabobank$|kosten/],
    ['studie', /universiteit|hogeschool|studenten|vereniging|duo\b/],
    ['boetes', /cjib|intrum|incasso|deurwaarder|derdengelden/],
  ];

  const PREFIX = /^(ccv\*|bck\*|sumup \*|zettle_\*|pay\.nl\*|c&m\*|bng\*|ubr\* |sq \*|sp )/i;

  function cleanName(t) {
    let n = (t.name || '').trim();
    if (/^NLOV/.test(n)) return 'OV-betaling';
    n = n.replace(PREFIX, '').replace(/\s+(\d{3,}|fil\d+)$/i, '').replace(/\s+via\s+.*$/i, '').trim();
    if (n === n.toUpperCase() && /[A-Z]{3}/.test(n)) n = n.toLowerCase().replace(/(^|[\s\-'&*.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
    return n || '(onbekend)';
  }

  function ruleKey(t) {
    if (/^NLOV/.test(t.name || '')) return 'ov-betaling';
    return cleanName(t).toLowerCase();
  }

  // extra: [[categorie, regex]] met eigen trefwoorden; die gaan voor de algemene regels
  function autoCategory(t, extra) {
    const name = (t.name || '').toLowerCase().replace(PREFIX, '');
    if (t.type === 'tb') return 'eigen';
    if (t.type === 'ga') return 'contant';
    if (t.type === 'sb') return 'salaris';
    if (/duo hoofdrekening/.test(name)) return t.amount > 0 ? 'duo' : 'studie';
    if (/belastingdienst/.test(name)) return t.amount > 0 ? 'toeslag' : 'vastelasten';
    const isP2P = /via tikkie|betaalverz|via ing |via rabo|wiebetaaltwat|via bunq/.test(name) || t.type === 'bv' || t.type === 'we';
    for (const [cat, re] of (extra || []).concat(RULES)) {
      if (re.test(name)) {
        if (isP2P && !['studie', 'vervoer'].includes(cat)) break;
        return cat;
      }
    }
    if (isP2P) return 'vrienden';
    if (t.amount > 0) return t.type === 'st' ? 'overig' : 'inkomen';
    if (['bg', 'db', 'cb'].includes(t.type)) return 'overboeking';
    return 'overig';
  }

  const api = { CATEGORIES, autoCategory, cleanName, ruleKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Kasboek = api;
})(this);
