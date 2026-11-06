// Synthetic source inputs only; no account, order or captured page data.
export function videoRecoveryDocument(scenario) {
  const card = (n, bad = false, label = 'You purchased this') => `<article data-card-entity-id="amzn1.dv.gti.fixture-${n}" data-card-entity-type="${n % 2 ? 'MOVIE' : 'TV_SEASON'}" ${bad ? '' : `data-card-title="Synthetic Video ${n}"`} style="height:20px"><a href="/detail/B${String(n).padStart(9, '0')}"></a><span>${label}</span></article>`;
  let cards = Array.from({length: 21}, (_, i) => card(i + 1, i === 20 && ['partial', 'history'].includes(scenario)));
  let total = 21;
  if (scenario === 'history') { cards.push(card(98)); total++; }
  if (scenario === 'mixed') {
    cards = ['You purchased this', 'Rental', 'Included with your subscription', 'Included with Prime', 'Watch now'].map((label, i) => card(1001 + i, false, label));
    cards.push(card(1006, true)); total = 6;
  }
  if (scenario === 'movies-tv') cards = cards.map(html => html.replace(/TV_SEASON/g, 'MOVIE'));
  if (scenario === 'movies-tv') cards[20] = card(21, true).replace('MOVIE', 'TV_SEASON');
  if (scenario === 'empty') cards = [];
  if (scenario === 'broken') return '<main>Unrecognized provider layout</main>';
  return `<!doctype html><style>html,body{margin:0}article{display:block}</style><main>${scenario === 'inferred' ? '' : `<p>All items (${total})</p>`}${scenario === 'conflicting' ? '<p>All items (999)</p>' : ''}<div id="list">${cards.join('')}</div></main>${['auth', 'hidden-auth'].includes(scenario) ? `<form id="ap_signin_form" ${scenario === 'hidden-auth' ? 'hidden' : ''}><input type="password"></form>` : ''}`;
}
