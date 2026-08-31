const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const money = n => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const nl2br = s => esc(s).replaceAll('\n', '<br>');
const state = { user: null, favorites: [], authMode: 'login' };

const categories = [
  ['📄', 'Currículos', 'Currículos profissionais'],
  ['📁', 'Documentos', 'Modelos prontos'],
  ['💰', 'Finanças', 'Organize seu dinheiro'],
  ['🧮', 'Calculadoras', 'Cálculos úteis'],
  ['📚', 'Estudos', 'Apoio para aprender'],
  ['🧰', 'Utilidades', 'Ferramentas do dia a dia'],
  ['🧩', 'PDF', 'Unir e organizar páginas']
];

const tools = [
  { id: 'curriculo', icon: '👤', name: 'Gerador de Currículo', desc: 'Currículos profissionais com foto, modelos e exportação', cat: 'Currículos' },
  { id: 'recibo', icon: '🧾', name: 'Criador de Recibo', desc: 'Recibos elegantes com logo e vários modelos', cat: 'Documentos' },
  { id: 'orcamento', icon: '💵', name: 'Orçamento Profissional', desc: 'Orçamentos comerciais com modelos premium', cat: 'Documentos' },
  { id: 'pdfstudio', icon: '🧩', name: 'Organizador de PDF', desc: 'Una PDFs, reorganize arquivos e remova páginas', cat: 'PDF' },
  { id: 'gastos', icon: '📊', name: 'Controle de Gastos', desc: 'Acompanhe e organize seus gastos', cat: 'Finanças' },
  { id: 'juros', icon: '％', name: 'Calculadora de Juros', desc: 'Calcule juros simples e compostos', cat: 'Calculadoras' },
  { id: 'divisor', icon: '👥', name: 'Divisor de Contas', desc: 'Divida contas entre amigos facilmente', cat: 'Calculadoras' },
  { id: 'declaracao', icon: '📃', name: 'Declaração Profissional', desc: 'Gere declarações com modelos e exportação', cat: 'Documentos' },
  { id: 'checklist', icon: '✅', name: 'Checklist Diário', desc: 'Organize tarefas e não esqueça nada', cat: 'Utilidades' },
  { id: 'emprestimo', icon: '🏦', name: 'Simulador de Empréstimo', desc: 'Simule parcelas e juros com resumo visual', cat: 'Finanças' }
];

function toast(t) {
  const x = $('#toast');
  x.textContent = t;
  x.classList.add('show');
  setTimeout(() => x.classList.remove('show'), 2600);
}

async function api(path, opt = {}) {
  const r = await fetch(path, { headers: { 'content-type': 'application/json', ...(opt.headers || {}) }, ...opt });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || d.technicalError || 'Erro');
  return d;
}

function renderCategories() {
  $('#categories').innerHTML = categories.map(x => `<div class="category"><i>${x[0]}</i><b>${x[1]}</b><small>${x[2]}</small></div>`).join('');
}

function renderTools(filter = '') {
  const q = filter.trim().toLowerCase();
  const list = tools.filter(t => !q || `${t.name} ${t.desc} ${t.cat}`.toLowerCase().includes(q));
  $('#toolsGrid').innerHTML = list.map(t => `<article class="tool" data-tool="${t.id}"><div class="tool-icon">${t.icon}</div><div><h3>${t.name}</h3><p>${t.desc}</p></div><button class="star" data-fav="${t.id}" title="Favoritar">${state.favorites.includes(t.id) ? '⭐' : '☆'}</button></article>`).join('') || '<p>Nenhuma ferramenta encontrada.</p>';
  $$('[data-tool]').forEach(e => e.onclick = ev => { if (ev.target.closest('[data-fav]')) return; openTool(e.dataset.tool); });
  $$('[data-fav]').forEach(e => e.onclick = ev => { ev.stopPropagation(); toggleFavorite(e.dataset.fav); });
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModals() { $$('.modal').forEach(x => x.classList.add('hidden')); }
$$('[data-close]').forEach(x => x.onclick = closeModals);
$$('.modal').forEach(m => m.onclick = e => { if (e.target === m) closeModals(); });

async function track(id) {
  if (state.user) api('/api/history', { method: 'POST', body: JSON.stringify({ toolId: id, title: tools.find(t => t.id === id)?.name }) }).catch(() => {});
}

const field = (label, id, type = 'text', extra = '') => `<label>${label}<input id="${id}" type="${type}" ${extra}></label>`;

function readImage(input) {
  return new Promise(resolve => {
    const f = input.files?.[0];
    if (!f) return resolve('');
    if (!f.type.startsWith('image/')) return resolve('');
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => resolve('');
    r.readAsDataURL(f);
  });
}

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 600);
}

function safeFilename(name, fallback = 'documento') {
  const v = String(name || fallback).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_ ]/g, '').trim().replace(/\s+/g, '-').toLowerCase();
  return v || fallback;
}

function documentExportCSS() {
  return `
  @page{size:A4;margin:12mm}
  *{box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff}
  .doc-sheet{width:100%;max-width:190mm;min-height:270mm;margin:0 auto;background:#fff;color:#172033;padding:14mm;font-family:Arial,Helvetica,sans-serif;box-sizing:border-box}
  .doc-layout-table,.doc-meta-table,.quote-table{width:100%;border-collapse:collapse;table-layout:fixed}
  .doc-layout-table td{vertical-align:top;border:0;padding:0}
  .doc-header-main{padding-right:18px}
  .doc-header-side{text-align:right;width:145px}
  .doc-photo{width:112px;height:112px;object-fit:cover;border-radius:12px;border:3px solid #fff}
  .doc-logo{max-width:145px;max-height:72px;object-fit:contain}
  .doc-kicker{font-size:9px;letter-spacing:.16em;font-weight:700;text-transform:uppercase;margin-bottom:8px}
  .doc-section{margin-top:20px;page-break-inside:avoid}
  .doc-section h3{font-size:11px;text-transform:uppercase;letter-spacing:.09em;margin:0 0 8px;padding-bottom:6px;border-bottom:1px solid #dfe4ec}
  .doc-section p,.skill-text{font-size:11.5px;line-height:1.55;margin:0}
  .cv-heading h1{font-size:26px;line-height:1.08;margin:0;color:#111827}
  .cv-heading h2{font-size:14px;font-weight:600;margin:6px 0}
  .cv-contact{font-size:10.5px;color:#667085;margin-top:9px;line-height:1.5}
  .cv-rule{height:2px;margin:18px 0 6px}
  .cv-modern{border-top:9px solid #3157f6}.cv-modern .doc-kicker,.cv-modern .cv-heading h2{color:#3157f6}.cv-modern .cv-rule{background:#3157f6}.cv-modern .doc-section h3{color:#2445c6}
  .cv-executive{border-top:9px solid #132238}.cv-executive .doc-kicker,.cv-executive .cv-heading h2{color:#132238}.cv-executive .cv-rule{background:#132238}.cv-executive .doc-section h3{color:#132238;border-bottom:2px solid #132238}
  .cv-elegant{border-top:9px solid #9a7647}.cv-elegant .doc-kicker,.cv-elegant .cv-heading h2{color:#7d5b31}.cv-elegant .cv-rule{background:#c9ae88}.cv-elegant .doc-section h3{color:#72502b}
  .cv-creative{border-top:9px solid #6d4fd3}.cv-creative .doc-kicker,.cv-creative .cv-heading h2{color:#6d4fd3}.cv-creative .cv-rule{background:#6d4fd3}.cv-creative .doc-section h3{color:#5437b2}
  .cv-minimal{border-top:1px solid #cfd5df}.cv-minimal .doc-kicker,.cv-minimal .cv-heading h2{color:#475467}.cv-minimal .cv-rule{background:#cfd5df}.cv-minimal .doc-section h3{color:#344054}
  .receipt-sheet,.quote-sheet{min-height:250mm}
  .doc-title-block{text-align:right}.doc-title-block .big-title{font-size:25px;font-weight:800;letter-spacing:.06em}.doc-title-block small{display:block;color:#667085;margin-top:5px;font-size:10px}
  .amount-box{display:inline-block;font-size:25px;font-weight:800;padding:11px 16px;border-radius:8px;margin:28px 0 20px;background:#eef2ff;color:#2543c5}
  .receipt-copy{font-size:13px;line-height:1.7;margin:0 0 22px}
  .doc-meta-table{margin:20px 0}.doc-meta-table td{border:1px solid #dfe4ec;padding:10px 11px;vertical-align:top}.doc-meta-table small{display:block;color:#667085;font-size:8.5px;text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}.doc-meta-table b{font-size:11px;line-height:1.35}
  .doc-note{margin-top:20px;background:#f7f9fc;border:1px solid #e5e9f0;border-radius:7px;padding:11px;font-size:10.5px}.doc-note p{margin:5px 0 0;line-height:1.55}
  .signature-wrap{margin:52px auto 0;width:280px;text-align:center;page-break-inside:avoid}.signature-line{border-top:1px solid #344054;width:100%;height:1px}.signature-name{text-align:center;font-size:11px;font-weight:600;margin-top:7px}
  .receipt-blue,.quote-blue{border-top:9px solid #3157f6}.receipt-blue .amount-box{background:#eef2ff;color:#2543c5}
  .receipt-green,.quote-green{border-top:9px solid #118567}.receipt-green .amount-box{background:#e9f8f2;color:#117a55}
  .receipt-sunset,.quote-sunset{border-top:9px solid #d96d3f}.receipt-sunset .amount-box{background:#fff0e6;color:#ad502d}
  .receipt-classic,.quote-classic{border:1px solid #bfc6d1}.receipt-classic .amount-box{background:#f3f4f6;color:#111827}
  .receipt-navy,.quote-navy{border-top:9px solid #132238}.receipt-navy .amount-box{background:#e9eef5;color:#132238}
  .quote-brand{font-size:17px;font-weight:800}.quote-meta{margin:28px 0 18px}
  .quote-table{margin-top:8px}.quote-table th,.quote-table td{border-bottom:1px solid #dfe4ec;padding:9px 8px;font-size:10.5px;vertical-align:middle}.quote-table th{font-size:8.5px;text-transform:uppercase;letter-spacing:.04em;background:#f5f7fa;color:#475467}.quote-table .col-desc{text-align:left}.quote-table .col-qty,.quote-table .col-money{text-align:center;white-space:nowrap}.quote-total-card{margin:18px 0 0 auto;width:270px;border:1px solid #dfe4ec;padding:11px 14px;text-align:right}.quote-total-card small{display:block;color:#667085;font-size:8.5px;text-transform:uppercase}.quote-total-card strong{display:block;font-size:20px;margin-top:3px}
  .quote-footer{margin-top:38px;padding-top:12px;border-top:1px solid #e3e7ee;color:#667085;font-size:9.5px;line-height:1.5}
  .declaration-sheet{min-height:255mm;padding:17mm}.declaration-cap{font-size:9px;letter-spacing:.2em;font-weight:700}.declaration-sheet h1{font-size:27px;margin:8px 0 35px}.declaration-body{font-size:12.5px;line-height:1.85;text-align:justify}.declaration-date{margin-top:38px;text-align:right}.declaration-blue{border-top:9px solid #3157f6}.declaration-blue .declaration-cap{color:#3157f6}.declaration-green{border-top:9px solid #118567}.declaration-green .declaration-cap{color:#118567}.declaration-elegant{border-top:9px solid #9a7647}.declaration-elegant .declaration-cap{color:#7d5b31}.declaration-navy{border-top:9px solid #132238}.declaration-navy .declaration-cap{color:#132238}
  `;
}

function exportWord(element, filename) {
  /* Word abre HTML .doc preservando melhor tabelas, bordas, tipografia, imagem e espaçamentos do preview. */
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="ProgId" content="Word.Document"><meta name="Generator" content="Portal Útil"><style>${documentExportCSS()}</style></head><body>${element.outerHTML}</body></html>`;
  downloadBlob(new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' }), `${filename}.doc`);
}

async function exportPDF(element, filename) {
  try {
    if (!window.html2canvas || !window.jspdf?.jsPDF) throw new Error('Biblioteca de PDF indisponível.');
    toast('Preparando PDF em alta qualidade...');
    const canvas = await window.html2canvas(element, { scale: 2.4, useCORS: true, backgroundColor: '#ffffff', logging: false, imageTimeout: 12000 });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210, pageHeight = 297;
    const margin = 7;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = canvas.height * imgWidth / canvas.width;
    const img = canvas.toDataURL('image/jpeg', 0.98);
    let y = margin;
    pdf.addImage(img, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'FAST');
    let left = imgHeight - (pageHeight - margin * 2);
    while (left > 0) {
      pdf.addPage();
      y = margin - (imgHeight - left);
      pdf.addImage(img, 'JPEG', margin, y, imgWidth, imgHeight, undefined, 'FAST');
      left -= (pageHeight - margin * 2);
    }
    pdf.save(`${filename}.pdf`);
  } catch (e) {
    toast('Não foi possível gerar o PDF direto. Abrindo impressão como alternativa.');
    printArea(element.outerHTML);
  }
}

function printArea(html) {
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Portal Útil</title><meta charset="utf-8"><style>${documentExportCSS()}@media print{body{padding:0}.doc-sheet{box-shadow:none}}</style></head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function docActions(container, filenameBase) {
  return `<div class="export-bar"><span>Exportar documento</span><div><button class="ghost export-word">📝 Word</button><button class="primary export-pdf">📕 PDF</button><button class="ghost export-print">🖨 Imprimir</button></div></div>`;
}

function bindDocActions(out, filenameBase) {
  const el = out.querySelector('.doc-sheet');
  out.querySelector('.export-word')?.addEventListener('click', () => exportWord(el, filenameBase));
  out.querySelector('.export-pdf')?.addEventListener('click', () => exportPDF(el, filenameBase));
  out.querySelector('.export-print')?.addEventListener('click', () => printArea(el.outerHTML));
}

function templatePicker(options, selected, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'template-picker';
  wrap.innerHTML = `<div class="template-title"><div><b>Escolha o modelo profissional</b><small>O documento final mantém o modelo selecionado no PDF e no Word.</small></div></div><div class="template-options">${options.map(o => `<button class="template-chip ${o.id === selected ? 'active' : ''}" data-template="${o.id}"><span class="swatch ${o.id}"></span><span><b>${o.label}</b>${o.desc ? `<small>${o.desc}</small>` : ''}</span></button>`).join('')}</div>`;
  wrap.querySelectorAll('[data-template]').forEach(btn => btn.onclick = () => onPick(btn.dataset.template));
  return wrap;
}

function signatureBlock(name, subtitle = 'Assinatura') {
  if (!String(name || '').trim()) return '';
  return `<div class="signature-wrap"><div class="signature-line"></div><div class="signature-name">${esc(name)}</div><div class="signature-caption">${esc(subtitle)}</div></div>`;
}

function makeCV(data, template) {
  const photo = data.photo ? `<img class="doc-photo" src="${data.photo}" alt="Foto do currículo">` : '';
  return `<section class="doc-sheet cv-sheet cv-${template}">
    <table class="doc-layout-table cv-head-table"><tr>
      <td class="doc-header-main"><div class="cv-heading"><div class="doc-kicker">CURRÍCULO PROFISSIONAL</div><h1>${esc(data.name)}</h1><h2>${esc(data.role)}</h2><div class="cv-contact">${esc(data.phone)}${data.phone && data.email ? ' &nbsp;•&nbsp; ' : ''}${esc(data.email)}${data.city ? ` &nbsp;•&nbsp; ${esc(data.city)}` : ''}</div></div></td>
      <td class="doc-header-side">${photo}</td>
    </tr></table>
    <div class="cv-rule"></div>
    <div class="cv-content-grid">
      <div class="doc-section profile-section"><h3>Perfil profissional</h3><p>${nl2br(data.summary)}</p></div>
      <div class="doc-section"><h3>Experiência profissional</h3><p>${nl2br(data.exp)}</p></div>
      <div class="doc-section"><h3>Formação acadêmica</h3><p>${nl2br(data.edu)}</p></div>
      <div class="doc-section"><h3>Competências e habilidades</h3><div class="skill-text">${nl2br(data.skills)}</div></div>
      ${data.extra ? `<div class="doc-section"><h3>Informações adicionais</h3><p>${nl2br(data.extra)}</p></div>` : ''}
    </div>
  </section>`;
}

function setupCurriculo(b) {
  let photo = '', currentTemplate = 'modern', data = null;
  b.innerHTML = `<div class="form-grid">${field('Nome completo','cvName')}${field('Profissão / objetivo','cvRole')}${field('Telefone','cvPhone')}${field('E-mail','cvEmail','email')}${field('Cidade / Estado','cvCity')}<label>Foto de rosto (opcional)<input id="cvPhoto" type="file" accept="image/*"></label><label class="span2">Resumo profissional<textarea id="cvSummary" rows="4" placeholder="Apresente seu perfil, experiência e principais diferenciais."></textarea></label><label class="span2">Experiência profissional<textarea id="cvExp" rows="6" placeholder="Empresa — Cargo — Período\nPrincipais atividades e resultados..."></textarea></label><label class="span2">Formação<textarea id="cvEdu" rows="4" placeholder="Curso — Instituição — Ano"></textarea></label><label class="span2">Habilidades<textarea id="cvSkills" rows="4" placeholder="Atendimento; Excel; manutenção; programação..."></textarea></label><label class="span2">Informações adicionais (opcional)<textarea id="cvExtra" rows="3" placeholder="Cursos, idiomas, CNH, disponibilidade..."></textarea></label></div><div id="cvPhotoPreview" class="upload-preview hidden"></div><div class="tool-actions"><button class="primary" id="genCv">Gerar currículo profissional</button></div><div id="out"></div>`;
  $('#cvPhoto').onchange = async e => { photo = await readImage(e.target); const p = $('#cvPhotoPreview'); if (photo) { p.classList.remove('hidden'); p.innerHTML = `<img src="${photo}"><span>Foto selecionada. Ela ficará alinhada no canto superior direito.</span>`; } };
  const models=[
    {id:'modern',label:'Corporativo Azul',desc:'Atual, limpo e recrutamento'},
    {id:'executive',label:'Executivo Navy',desc:'Sóbrio para cargos corporativos'},
    {id:'elegant',label:'Elegance Gold',desc:'Refinado e sofisticado'},
    {id:'creative',label:'Premium Violeta',desc:'Contemporâneo e diferenciado'},
    {id:'minimal',label:'Minimalista',desc:'Discreto e objetivo'}
  ];
  const render = () => {
    const out = $('#out'); out.innerHTML = '';
    out.appendChild(templatePicker(models, currentTemplate, t => { currentTemplate = t; render(); }));
    out.insertAdjacentHTML('beforeend', `<div class="doc-preview">${makeCV(data, currentTemplate)}</div>${docActions(out, 'curriculo')}`);
    bindDocActions(out, `curriculo-${safeFilename(data.name)}`);
  };
  $('#genCv').onclick = () => {
    data = { name: $('#cvName').value, role: $('#cvRole').value, phone: $('#cvPhone').value, email: $('#cvEmail').value, city: $('#cvCity').value, summary: $('#cvSummary').value, exp: $('#cvExp').value, edu: $('#cvEdu').value, skills: $('#cvSkills').value, extra: $('#cvExtra').value, photo };
    if (!data.name.trim()) return toast('Informe o nome para gerar o currículo.');
    render();
  };
}

function makeReceipt(data, template) {
  const logo = data.logo ? `<img class="doc-logo" src="${data.logo}" alt="Logo">` : `<div class="receipt-mark">PU</div>`;
  return `<section class="doc-sheet receipt-sheet receipt-${template}">
    <table class="doc-layout-table"><tr><td>${logo}</td><td class="doc-title-block"><div class="big-title">RECIBO</div><small>${esc(data.number || 'COMPROVANTE DE RECEBIMENTO')}</small></td></tr></table>
    <div class="receipt-main"><div class="amount-box">${money(data.value)}</div><p class="receipt-copy">Recebi de <strong>${esc(data.from)}</strong> a quantia de <strong>${money(data.value)}</strong>, referente a <strong>${esc(data.forText)}</strong>, dando plena quitação do valor descrito neste recibo.</p>
    <table class="doc-meta-table receipt-details"><tr><td><small>Local</small><b>${esc(data.city)}</b></td><td><small>Data</small><b>${esc(data.date)}</b></td><td><small>Forma de pagamento</small><b>${esc(data.payment || 'Não informada')}</b></td></tr></table>
    ${data.obs ? `<div class="doc-note"><b>Observações</b><p>${nl2br(data.obs)}</p></div>` : ''}
    ${signatureBlock(data.to, 'Recebedor / responsável')}</div>
  </section>`;
}

function setupRecibo(b) {
  let logo = '', currentTemplate = 'blue', data = null;
  b.innerHTML = `<div class="form-grid">${field('Recebi de','rFrom')}${field('Valor','rValue','number','step="0.01"')}${field('Referente a','rFor')}${field('Cidade','rCity')}${field('Data','rDate','date')}${field('Recebedor / empresa','rTo')}${field('Nº do recibo (opcional)','rNumber')}<label>Forma de pagamento<select id="rPayment"><option>PIX</option><option>Dinheiro</option><option>Cartão</option><option>Transferência</option><option>Outro</option></select></label><label>Logo (opcional)<input id="rLogo" type="file" accept="image/*"></label><label class="span2">Observações (opcional)<textarea id="rObs" rows="3"></textarea></label></div><div id="rLogoPreview" class="upload-preview hidden"></div><div class="tool-actions"><button class="primary" id="gen">Gerar recibo profissional</button></div><div id="out"></div>`;
  $('#rDate').value = new Date().toISOString().slice(0,10);
  $('#rLogo').onchange = async e => { logo = await readImage(e.target); const p = $('#rLogoPreview'); if (logo) { p.classList.remove('hidden'); p.innerHTML = `<img src="${logo}"><span>Logo pronta para ser aplicada ao recibo.</span>`; } };
  const models=[{id:'blue',label:'Corporate Blue',desc:'Institucional e moderno'},{id:'navy',label:'Executive Navy',desc:'Elegante e sóbrio'},{id:'green',label:'Emerald',desc:'Profissional e leve'},{id:'sunset',label:'Premium Terracota',desc:'Colorido e refinado'},{id:'classic',label:'Clássico',desc:'Formal e discreto'}];
  const render = () => { const out = $('#out'); out.innerHTML = ''; out.appendChild(templatePicker(models, currentTemplate, t => { currentTemplate=t; render(); })); out.insertAdjacentHTML('beforeend', `<div class="doc-preview">${makeReceipt(data,currentTemplate)}</div>${docActions(out)}`); bindDocActions(out, `recibo-${safeFilename(data.from)}`); };
  $('#gen').onclick = () => { data = { from:$('#rFrom').value,value:$('#rValue').value,forText:$('#rFor').value,city:$('#rCity').value,date:$('#rDate').value,to:$('#rTo').value,number:$('#rNumber').value,payment:$('#rPayment').value,obs:$('#rObs').value,logo }; if(!data.from.trim()||!(Number(data.value)>0)) return toast('Informe quem pagou e o valor do recibo.'); render(); };
}

function makeQuote(data, template) {
  const logo = data.logo ? `<img class="doc-logo" src="${data.logo}" alt="Logo">` : `<div class="quote-brand">${esc(data.seller || 'Proposta Comercial')}</div>`;
  const total = data.items.reduce((s,i)=>s+i.qty*i.unit,0);
  return `<section class="doc-sheet quote-sheet quote-${template}">
    <table class="doc-layout-table"><tr><td>${logo}</td><td class="doc-title-block"><div class="big-title">ORÇAMENTO</div><small>Validade da proposta: ${esc(data.days)} dias</small></td></tr></table>
    <table class="doc-meta-table quote-meta"><tr><td><small>Cliente</small><b>${esc(data.client)}</b></td><td><small>Responsável</small><b>${esc(data.seller)}</b></td><td><small>Data de emissão</small><b>${esc(data.date)}</b></td></tr></table>
    <table class="quote-table"><colgroup><col style="width:46%"><col style="width:12%"><col style="width:21%"><col style="width:21%"></colgroup><thead><tr><th class="col-desc">Descrição</th><th class="col-qty">Qtd.</th><th class="col-money">Valor unitário</th><th class="col-money">Total</th></tr></thead><tbody>${data.items.map(i=>`<tr><td class="col-desc">${esc(i.desc)}</td><td class="col-qty">${i.qty}</td><td class="col-money">${money(i.unit)}</td><td class="col-money">${money(i.qty*i.unit)}</td></tr>`).join('')}</tbody></table>
    <div class="quote-total-card"><small>Valor total da proposta</small><strong>${money(total)}</strong></div>
    ${data.obs?`<div class="doc-note"><b>Condições comerciais / observações</b><p>${nl2br(data.obs)}</p></div>`:''}
    <div class="quote-footer"><strong>Obrigado pela oportunidade.</strong><br>Esta proposta foi preparada com base nas informações fornecidas e poderá ser ajustada mediante alinhamento entre as partes.</div>
  </section>`;
}

function setupOrcamento(b) {
  let logo='', currentTemplate='blue', data=null, items=[{desc:'',qty:1,unit:''}];
  b.innerHTML = `<div class="form-grid">${field('Cliente','oClient')}${field('Seu nome / empresa','oSeller')}${field('Data','oDate','date')}${field('Validade (dias)','oDays','number','value="7"')}<label>Logo (opcional)<input id="oLogo" type="file" accept="image/*"></label></div><div class="item-builder"><div class="item-builder-head"><b>Itens do orçamento</b><button class="ghost" id="addItem">+ Adicionar item</button></div><div id="quoteItems"></div></div><label class="wide-label">Observações / condições<textarea id="oObs" rows="4"></textarea></label><div id="oLogoPreview" class="upload-preview hidden"></div><div class="tool-actions"><button class="primary" id="gen">Gerar orçamento profissional</button></div><div id="out"></div>`;
  $('#oDate').value = new Date().toISOString().slice(0,10);
  $('#oLogo').onchange=async e=>{logo=await readImage(e.target);const p=$('#oLogoPreview');if(logo){p.classList.remove('hidden');p.innerHTML=`<img src="${logo}"><span>Logo pronta para o orçamento.</span>`;}};
  function renderItems(){ $('#quoteItems').innerHTML=items.map((it,i)=>`<div class="quote-item-row"><input class="qi-desc" data-i="${i}" placeholder="Descrição do produto/serviço" value="${esc(it.desc)}"><input class="qi-qty" data-i="${i}" type="number" min="1" step="1" value="${it.qty}"><input class="qi-unit" data-i="${i}" type="number" min="0" step="0.01" placeholder="Valor" value="${esc(it.unit)}"><button class="mini-danger qi-del" data-i="${i}" ${items.length===1?'disabled':''}>×</button></div>`).join(''); $$('.qi-desc').forEach(x=>x.oninput=()=>items[+x.dataset.i].desc=x.value); $$('.qi-qty').forEach(x=>x.oninput=()=>items[+x.dataset.i].qty=Math.max(1,+x.value||1)); $$('.qi-unit').forEach(x=>x.oninput=()=>items[+x.dataset.i].unit=+x.value||0); $$('.qi-del').forEach(x=>x.onclick=()=>{items.splice(+x.dataset.i,1);renderItems();}); }
  renderItems(); $('#addItem').onclick=()=>{items.push({desc:'',qty:1,unit:''});renderItems();};
  const models=[{id:'blue',label:'Corporate Blue',desc:'Comercial e organizado'},{id:'navy',label:'Executive Navy',desc:'Sofisticado e corporativo'},{id:'green',label:'Emerald Business',desc:'Leve e profissional'},{id:'sunset',label:'Premium Terracota',desc:'Diferenciado e elegante'},{id:'classic',label:'Minimalista',desc:'Limpo e objetivo'}];
  const render=()=>{const out=$('#out');out.innerHTML='';out.appendChild(templatePicker(models,currentTemplate,t=>{currentTemplate=t;render();}));out.insertAdjacentHTML('beforeend',`<div class="doc-preview">${makeQuote(data,currentTemplate)}</div>${docActions(out)}`);bindDocActions(out,`orcamento-${safeFilename(data.client)}`);};
  $('#gen').onclick=()=>{data={client:$('#oClient').value,seller:$('#oSeller').value,date:$('#oDate').value,days:$('#oDays').value,obs:$('#oObs').value,logo,items:items.filter(i=>i.desc.trim()&&Number(i.unit)>=0).map(i=>({...i}))};if(!data.client.trim()||!data.items.length)return toast('Informe o cliente e pelo menos um item.');render();};
}

function calcResult(title, main, lines, theme='blue') {
  const names={blue:'Corporativo',green:'Esmeralda',violet:'Premium'};
  return `<div class="calc-result calc-${theme}"><div class="calc-badge">RESULTADO • ${names[theme]||'PROFISSIONAL'}</div><h3>${title}</h3><div class="calc-main">${main}</div><div class="calc-lines">${lines.map(x=>`<div><span>${x[0]}</span><b>${x[1]}</b></div>`).join('')}</div></div><div class="mini-template-row"><span>Estilo do resultado:</span><button data-calc-theme="blue">Corporativo</button><button data-calc-theme="green">Esmeralda</button><button data-calc-theme="violet">Premium</button></div>`;
}
function bindCalcThemes(out, rerender){out.querySelectorAll('[data-calc-theme]').forEach(x=>x.onclick=()=>rerender(x.dataset.calcTheme));}

function makeDeclaration(data, template) {
  return `<section class="doc-sheet declaration-sheet declaration-${template}"><div class="declaration-cap">DOCUMENTO FORMAL</div><h1>Declaração</h1><div class="declaration-body"><p>Eu, <strong>${esc(data.name)}</strong>${data.cpf?`, inscrito(a) no CPF sob nº <strong>${esc(data.cpf)}</strong>`:''}, declaro, para os devidos fins:</p><p>${nl2br(data.text)}</p><p class="declaration-date">${esc(data.city)}, ${esc(data.date)}.</p>${signatureBlock(data.name, 'Declarante')}</div></section>`;
}

function setupDeclaration(b){let currentTemplate='blue',data=null;b.innerHTML=`<div class="form-grid">${field('Nome do declarante','deName')}${field('CPF (opcional)','deCpf')}${field('Cidade','deCity')}${field('Data','deDate','date')}<label class="span2">Texto da declaração<textarea id="deText" rows="7" placeholder="Declaro, para os devidos fins, que..."></textarea></label></div><div class="tool-actions"><button class="primary" id="gen">Gerar declaração profissional</button></div><div id="out"></div>`;$('#deDate').value=new Date().toISOString().slice(0,10);const models=[{id:'blue',label:'Institucional Azul',desc:'Formal e corporativo'},{id:'navy',label:'Executive Navy',desc:'Sóbrio e sofisticado'},{id:'green',label:'Esmeralda',desc:'Profissional e leve'},{id:'elegant',label:'Elegance Gold',desc:'Refinado e clássico'}];const render=()=>{const out=$('#out');out.innerHTML='';out.appendChild(templatePicker(models,currentTemplate,t=>{currentTemplate=t;render();}));out.insertAdjacentHTML('beforeend',`<div class="doc-preview">${makeDeclaration(data,currentTemplate)}</div>${docActions(out)}`);bindDocActions(out,`declaracao-${safeFilename(data.name)}`);};$('#gen').onclick=()=>{data={name:$('#deName').value,cpf:$('#deCpf').value,city:$('#deCity').value,date:$('#deDate').value,text:$('#deText').value};if(!data.name.trim()||!data.text.trim())return toast('Informe o nome e o texto da declaração.');render();};}

async function setupPdfStudio(b) {
  let docs = [];
  b.innerHTML = `<div class="pdf-intro"><div><span class="eyebrow">100% no seu navegador</span><h3>Seus PDFs não são enviados para servidor</h3><p>Adicione um ou vários arquivos, organize a ordem, escolha as páginas que deseja manter e gere um único PDF.</p></div><div class="privacy-pill">🔒 Processamento local</div></div><label class="pdf-drop"><input id="pdfFiles" type="file" accept="application/pdf" multiple><span>📥</span><b>Selecionar arquivos PDF</b><small>Você pode adicionar vários PDFs de uma vez</small></label><div id="pdfList"></div><div class="pdf-actions hidden" id="pdfActions"><button class="primary" id="mergePdf">Gerar PDF final</button><button class="ghost" id="selectAllPages">Marcar todas</button><button class="ghost" id="clearPages">Desmarcar todas</button></div><div id="pdfStatus"></div>`;
  const input=$('#pdfFiles'), list=$('#pdfList'), actions=$('#pdfActions');
  if(!window.PDFLib){$('#pdfStatus').innerHTML='<div class="result">Não foi possível carregar o mecanismo PDF. Verifique sua conexão e atualize a página.</div>';return;}
  async function addFiles(files){for(const file of files){try{const bytes=new Uint8Array(await file.arrayBuffer());const pdf=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:true});docs.push({file,bytes,pageCount:pdf.getPageCount(),selected:Array(pdf.getPageCount()).fill(true)});}catch(e){toast(`Não foi possível abrir ${file.name}`);}}render();}
  function move(i,dir){const j=i+dir;if(j<0||j>=docs.length)return;[docs[i],docs[j]]=[docs[j],docs[i]];render();}
  function render(){actions.classList.toggle('hidden',!docs.length);list.innerHTML=docs.map((d,i)=>`<article class="pdf-file-card"><div class="pdf-file-top"><div class="pdf-file-icon">PDF</div><div><b>${esc(d.file.name)}</b><small>${d.pageCount} página${d.pageCount!==1?'s':''}</small></div><div class="pdf-order"><button class="ghost" data-up="${i}" ${i===0?'disabled':''}>↑</button><button class="ghost" data-down="${i}" ${i===docs.length-1?'disabled':''}>↓</button><button class="mini-danger" data-remove="${i}">×</button></div></div><div class="page-selector">${d.selected.map((on,p)=>`<label class="page-pill ${on?'on':''}"><input type="checkbox" data-doc="${i}" data-page="${p}" ${on?'checked':''}><span>${p+1}</span></label>`).join('')}</div></article>`).join('');$$('[data-up]').forEach(x=>x.onclick=()=>move(+x.dataset.up,-1));$$('[data-down]').forEach(x=>x.onclick=()=>move(+x.dataset.down,1));$$('[data-remove]').forEach(x=>x.onclick=()=>{docs.splice(+x.dataset.remove,1);render();});$$('[data-doc][data-page]').forEach(x=>x.onchange=()=>{docs[+x.dataset.doc].selected[+x.dataset.page]=x.checked;x.closest('.page-pill').classList.toggle('on',x.checked);});}
  input.onchange=e=>addFiles([...e.target.files]);
  $('#selectAllPages').onclick=()=>{docs.forEach(d=>d.selected.fill(true));render();};
  $('#clearPages').onclick=()=>{docs.forEach(d=>d.selected.fill(false));render();};
  $('#mergePdf').onclick=async()=>{const total=docs.reduce((s,d)=>s+d.selected.filter(Boolean).length,0);if(!total)return toast('Marque pelo menos uma página.');try{$('#pdfStatus').innerHTML='<div class="result">Gerando o PDF final...</div>';const out=await PDFLib.PDFDocument.create();for(const d of docs){const src=await PDFLib.PDFDocument.load(d.bytes,{ignoreEncryption:true});const idx=d.selected.map((on,i)=>on?i:-1).filter(i=>i>=0);const pages=await out.copyPages(src,idx);pages.forEach(p=>out.addPage(p));}const bytes=await out.save();downloadBlob(new Blob([bytes],{type:'application/pdf'}),'portal-util-pdf-organizado.pdf');$('#pdfStatus').innerHTML=`<div class="result success-result"><b>PDF gerado com sucesso.</b><p>${total} página(s) foram reunidas na ordem escolhida.</p></div>`;}catch(e){$('#pdfStatus').innerHTML=`<div class="result"><b>Não foi possível gerar o PDF.</b><p>${esc(e.message)}</p></div>`;}};
}

async function openTool(id) {
  const t = tools.find(x => x.id === id);
  $('#toolContent').innerHTML = `<span class="eyebrow">${t.icon} ${t.cat}</span><h2>${t.name}</h2><p>${t.desc}</p><div id="toolBody"></div>`;
  openModal('#toolModal'); track(id); const b = $('#toolBody');
  if (id === 'curriculo') return setupCurriculo(b);
  if (id === 'recibo') return setupRecibo(b);
  if (id === 'orcamento') return setupOrcamento(b);
  if (id === 'declaracao') return setupDeclaration(b);
  if (id === 'pdfstudio') return setupPdfStudio(b);
  if (id === 'juros') {
    b.innerHTML = `<div class="form-grid">${field('Capital inicial','jP','number','step="0.01"')}${field('Taxa por período (%)','jR','number','step="0.01"')}${field('Número de períodos','jN','number')}<label>Tipo<select id="jType"><option value="compound">Compostos</option><option value="simple">Simples</option></select></label></div><div class="tool-actions"><button class="primary" id="calc">Calcular</button></div><div id="out"></div>`;
    $('#calc').onclick = () => { let theme='blue'; const rerender=t=>{theme=t;let p=+$('#jP').value,r=+$('#jR').value/100,n=+$('#jN').value,total=$('#jType').value==='simple'?p*(1+r*n):p*Math.pow(1+r,n);$('#out').innerHTML=calcResult('Resumo dos juros',money(total),[['Capital inicial',money(p)],['Juros acumulados',money(total-p)],['Períodos',String(n||0)]],theme);bindCalcThemes($('#out'),rerender);};rerender(theme); };
  }
  if (id === 'divisor') {
    b.innerHTML = `<div class="form-grid">${field('Valor total','dTotal','number','step="0.01"')}${field('Número de pessoas','dPeople','number','min="1"')}${field('Taxa de serviço (%)','dFee','number','step="0.01" value="0"')}</div><div class="tool-actions"><button class="primary" id="calc">Dividir</button></div><div id="out"></div>`;
    $('#calc').onclick=()=>{let theme='green';const rerender=t=>{theme=t;let total=+$('#dTotal').value*(1+(+$('#dFee').value||0)/100),n=Math.max(1,+$('#dPeople').value||1);$('#out').innerHTML=calcResult('Divisão da conta',money(total/n),[['Total com taxa',money(total)],['Pessoas',String(n)],['Taxa',`${+$('#dFee').value||0}%`]],theme);bindCalcThemes($('#out'),rerender);};rerender(theme);};
  }
  if (id === 'emprestimo') {
    b.innerHTML=`<div class="form-grid">${field('Valor do empréstimo','eP','number','step="0.01"')}${field('Juros ao mês (%)','eR','number','step="0.01"')}${field('Número de parcelas','eN','number','min="1"')}</div><div class="tool-actions"><button class="primary" id="calc">Simular</button></div><div id="out"></div>`;
    $('#calc').onclick=()=>{let theme='violet';const rerender=t=>{theme=t;let p=+$('#eP').value,r=+$('#eR').value/100,n=Math.max(1,+$('#eN').value||1),payment=r===0?p/n:p*r*Math.pow(1+r,n)/(Math.pow(1+r,n)-1),total=payment*n;$('#out').innerHTML=calcResult('Simulação do empréstimo',money(payment),[['Total pago',money(total)],['Juros totais',money(total-p)],['Parcelas',`${n}x`]],theme);bindCalcThemes($('#out'),rerender);};rerender(theme);};
  }
  if (id === 'gastos') return renderExpenses();
  if (id === 'checklist') return renderChecklist();
}

async function renderExpenses(){
  const b=$('#toolBody');
  if(!state.user){b.innerHTML='<div class="result professional-empty"><b>Controle financeiro pessoal</b><p>Faça login para salvar e sincronizar seus gastos.</p></div><button class="primary" id="goLogin">Entrar</button>';$('#goLogin').onclick=()=>{closeModals();openAuth()};return}
  let uiTheme='blue';
  b.innerHTML=`<div class="form-grid">${field('Descrição','gDesc')}${field('Valor','gValue','number','step="0.01"')}<label>Categoria<select id="gCat"><option>Alimentação</option><option>Transporte</option><option>Casa</option><option>Saúde</option><option>Lazer</option><option>Outros</option></select></label>${field('Data','gDate','date')}</div><div class="tool-actions"><button class="primary" id="addG">Adicionar gasto</button></div><div class="result-style-switcher"><span>Modelo do painel:</span><button data-fin-theme="blue">Corporativo</button><button data-fin-theme="green">Esmeralda</button><button data-fin-theme="slate">Executivo</button></div><div id="gList" class="finance-panel theme-blue"></div>`;
  $('#gDate').value=new Date().toISOString().slice(0,10);
  $$('[data-fin-theme]').forEach(x=>x.onclick=()=>{uiTheme=x.dataset.finTheme;$('#gList').className=`finance-panel theme-${uiTheme}`;});
  async function load(){const d=await api('/api/expenses');let total=d.items.reduce((s,x)=>s+x.amount,0);const month=new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'});$('#gList').innerHTML=`<div class="finance-summary"><div><span>Resumo financeiro</span><small>${month}</small></div><b>${money(total)}</b><small>${d.items.length} lançamento(s) registrados</small></div><div class="finance-table-head"><span>Descrição</span><span>Categoria / data</span><span>Valor</span><span>Ação</span></div><div class="finance-list">`+d.items.map(x=>`<div class="finance-row"><div><b>${esc(x.description)}</b></div><div><small>${esc(x.category)}</small><small>${esc(x.expense_date)}</small></div><strong>${money(x.amount)}</strong><button class="link-btn delG" data-id="${x.id}">Excluir</button></div>`).join('')+'</div>';$$('.delG').forEach(x=>x.onclick=async()=>{await api('/api/expenses',{method:'DELETE',body:JSON.stringify({id:+x.dataset.id})});load()})}
  $('#addG').onclick=async()=>{try{await api('/api/expenses',{method:'POST',body:JSON.stringify({description:$('#gDesc').value,amount:+$('#gValue').value,category:$('#gCat').value,expense_date:$('#gDate').value})});$('#gDesc').value='';$('#gValue').value='';load()}catch(e){toast(e.message)}};load();
}

async function renderChecklist(){
  const b=$('#toolBody');
  if(!state.user){b.innerHTML='<div class="result professional-empty"><b>Checklist inteligente</b><p>Faça login para salvar seu checklist na nuvem.</p></div><button class="primary" id="goLogin">Entrar</button>';$('#goLogin').onclick=()=>{closeModals();openAuth()};return}
  let uiTheme='blue';
  b.innerHTML=`<div class="search checklist-search"><input id="cText" placeholder="Adicionar nova tarefa..."><button id="addC">Adicionar</button></div><div class="result-style-switcher"><span>Modelo do checklist:</span><button data-check-theme="blue">Corporativo</button><button data-check-theme="green">Esmeralda</button><button data-check-theme="slate">Executivo</button></div><div id="cList" class="checklist-panel theme-blue"></div>`;
  $$('[data-check-theme]').forEach(x=>x.onclick=()=>{uiTheme=x.dataset.checkTheme;$('#cList').className=`checklist-panel theme-${uiTheme}`;});
  async function load(){const d=await api('/api/checklist');const done=d.items.filter(x=>x.done).length;$('#cList').innerHTML=`<div class="check-summary"><div><span>Progresso das tarefas</span><b>${done} de ${d.items.length} concluída(s)</b></div><strong>${d.items.length?Math.round(done/d.items.length*100):0}%</strong></div>`+(d.items.map(x=>`<div class="check-row ${x.done?'done':''}"><label><input type="checkbox" class="toggleC" data-id="${x.id}" ${x.done?'checked':''}><span>${esc(x.text)}</span></label><button class="link-btn delC" data-id="${x.id}">Excluir</button></div>`).join('')||'<div class="empty-state">✅ Nenhuma tarefa ainda. Adicione a primeira acima.</div>');$$('.toggleC').forEach(x=>x.onchange=async()=>{await api('/api/checklist',{method:'PATCH',body:JSON.stringify({id:+x.dataset.id,done:x.checked})});load();});$$('.delC').forEach(x=>x.onclick=async()=>{await api('/api/checklist',{method:'DELETE',body:JSON.stringify({id:+x.dataset.id})});load()})}
  $('#addC').onclick=async()=>{if(!$('#cText').value.trim())return;await api('/api/checklist',{method:'POST',body:JSON.stringify({text:$('#cText').value})});$('#cText').value='';load()};load();
}

async function toggleFavorite(id){if(!state.user){openAuth();return}const on=state.favorites.includes(id);await api('/api/favorites',{method:on?'DELETE':'POST',body:JSON.stringify({toolId:id})});await loadUserData();renderTools($('#searchInput').value)}
function openAuth(){openModal('#authModal')}
$('#loginBtn').onclick=openAuth;
$('#toggleAuth').onclick=()=>{state.authMode=state.authMode==='login'?'register':'login';$('#authTitle').textContent=state.authMode==='login'?'Entrar':'Criar conta';$('#nameWrap').classList.toggle('hidden',state.authMode==='login');$('#toggleAuth').textContent=state.authMode==='login'?'Ainda não tenho conta':'Já tenho uma conta';$('#authMsg').textContent=''};
$('#authForm').onsubmit=async e=>{e.preventDefault();try{const path=state.authMode==='login'?'/api/auth/login':'/api/auth/register';const payload={email:$('#authEmail').value,password:$('#authPassword').value,name:$('#authName').value};const d=await api(path,{method:'POST',body:JSON.stringify(payload)});state.user=d.user;closeModals();await refreshAuth();toast('Bem-vindo ao Portal Útil!')}catch(err){$('#authMsg').textContent=err.message}};
$('#logoutBtn').onclick=async()=>{await api('/api/auth/logout',{method:'POST'});state.user=null;state.favorites=[];refreshAuth()};

async function loadUserData(){if(!state.user)return;const [f,h]=await Promise.all([api('/api/favorites'),api('/api/history')]);state.favorites=f.items;$('#favList').innerHTML=f.items.map(id=>{const t=tools.find(x=>x.id===id);return t?`<div class="list-row"><span>${t.icon} ${t.name}</span><button class="link-btn" data-open="${id}">Abrir</button></div>`:''}).join('')||'<p>Favorite suas ferramentas preferidas.</p>';$('#historyList').innerHTML=h.items.slice(0,8).map(x=>`<div class="list-row"><span>${esc(x.title)}</span><small>${new Date(x.created_at+'Z').toLocaleDateString('pt-BR')}</small></div>`).join('')||'<p>Seu histórico aparecerá aqui.</p>';$$('[data-open]').forEach(x=>x.onclick=()=>openTool(x.dataset.open))}
async function refreshAuth(){const d=await api('/api/me');state.user=d.user;$('#loginBtn').classList.toggle('hidden',!!state.user);$('#avatarBtn').classList.toggle('hidden',!state.user);$('#dashboard').classList.toggle('hidden',!state.user);if(state.user){$('#avatarBtn').textContent=state.user.name.slice(0,1).toUpperCase();$('#welcome').textContent=`Olá, ${state.user.name.split(' ')[0]} 👋`;$('#planBox').innerHTML=`<b>${state.user.plan==='premium'?'♛ Premium':'Plano Grátis'}</b><p>${state.user.plan==='premium'?'Você tem acesso aos recursos Premium.':'Use todas as ferramentas básicas sem custo.'}</p>`;await loadUserData()}renderTools($('#searchInput').value)}
function premiumInfo(){toast('A cobrança automática ainda não está integrada. O projeto está preparado para adicionar Asaas, Mercado Pago ou outro gateway depois.')}
$('#premiumBtn').onclick=premiumInfo;$('#premiumBottom').onclick=premiumInfo;
$('#searchBtn').onclick=()=>renderTools($('#searchInput').value);$('#searchInput').oninput=e=>renderTools(e.target.value);$('#showAll').onclick=()=>{$('#searchInput').value='';renderTools()};
renderCategories();renderTools();refreshAuth();if('serviceWorker'in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
