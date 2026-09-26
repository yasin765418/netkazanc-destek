const RULES = {
  minimumCents: 3303000,
  ceilingCents: 29727000,
  sgkRate: 14,
  unemploymentRate: 1,
  stampRate: 759,
  thresholds: [19000000, 40000000, 150000000, 530000000],
  rates: [15, 20, 27, 35, 40],
};

const trMoney = new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: 'TRY', minimumFractionDigits: 2,
});
const trNumber = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 });

function numberValue(id) {
  let value = document.getElementById(id)?.value.trim().replaceAll(/\s/g, '') ?? '';
  if (value.includes(',')) value = value.replaceAll('.', '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(value)) value = value.replaceAll('.', '');
  return Number(value || 0);
}

const toCents = (value) => Math.round(value * 100);
const money = (cents) => trMoney.format(cents / 100);

function progressiveTax(base) {
  let previous = 0;
  let weighted = 0;
  for (let i = 0; i < RULES.rates.length; i += 1) {
    const upper = RULES.thresholds[i] ?? base;
    const portion = Math.max(0, Math.min(base, upper) - previous);
    weighted += portion * RULES.rates[i];
    previous = upper;
    if (base <= upper) break;
  }
  return Math.round(weighted / 100);
}

function grossToNet(gross, priorBase, month) {
  gross = toCents(gross);
  const insured = Math.min(gross, RULES.ceilingCents);
  const sgk = Math.round(insured * RULES.sgkRate / 100);
  const unemployment = Math.round(insured * RULES.unemploymentRate / 100);
  const base = gross - sgk - unemployment;
  const minimumBase = RULES.minimumCents
    - Math.round(RULES.minimumCents * RULES.sgkRate / 100)
    - Math.round(RULES.minimumCents * RULES.unemploymentRate / 100);
  const exemption = progressiveTax(minimumBase * month) - progressiveTax(minimumBase * (month - 1));
  const incomeTax = Math.max(0, progressiveTax(priorBase + base) - progressiveTax(priorBase) - exemption);
  const stamp = Math.max(0, Math.round((gross - RULES.minimumCents) * RULES.stampRate / 100000));
  return { gross, sgk, unemployment, base, incomeTax, stamp, net: gross - sgk - unemployment - incomeTax - stamp };
}

function marginalRate(base) {
  const index = RULES.thresholds.findIndex((limit) => base < limit);
  return RULES.rates[index < 0 ? RULES.rates.length - 1 : index];
}

function setText(id, value) {
  const node = document.getElementById(id);
  if (node) node.textContent = value;
}

function renderSlip(slip, prefix = '') {
  setText(`${prefix}net`, money(slip.net));
  setText(`${prefix}gross`, money(slip.gross));
  setText(`${prefix}sgk`, money(slip.sgk));
  setText(`${prefix}unemployment`, money(slip.unemployment));
  setText(`${prefix}base`, money(slip.base));
  setText(`${prefix}incomeTax`, money(slip.incomeTax));
  setText(`${prefix}stamp`, money(slip.stamp));
}

function setupGrossNet() {
  const form = document.querySelector('[data-calc="gross-net"]');
  if (!form) return;
  const calculate = () => {
    const gross = numberValue('grossSalary');
    const prior = toCents(numberValue('priorBase'));
    const month = Number(document.getElementById('salaryMonth').value);
    if (gross <= 0) return;
    const slip = grossToNet(gross, prior, month);
    renderSlip(slip);
    setText('newBase', money(prior + slip.base));
    setText('rate', `%${trNumber.format(marginalRate(prior + slip.base))}`);
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); calculate(); });
  calculate();
}

function setupAnnual() {
  const form = document.querySelector('[data-calc="annual"]');
  if (!form) return;
  const calculate = () => {
    const gross = numberValue('annualGross');
    if (gross <= 0) return;
    let prior = 0;
    let total = 0;
    const rows = [];
    for (let month = 1; month <= 12; month += 1) {
      const slip = grossToNet(gross, prior, month);
      prior += slip.base;
      total += slip.net;
      rows.push(`<tr><td>${month}. ay</td><td>${money(slip.net)}</td><td>${money(slip.incomeTax)}</td><td>%${trNumber.format(marginalRate(prior))}</td><td>${money(prior)}</td></tr>`);
    }
    document.getElementById('annualRows').innerHTML = rows.join('');
    setText('annualAverage', money(Math.round(total / 12)));
    setText('annualTotal', money(total));
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); calculate(); });
  calculate();
}

function workdayCount(year, monthIndex, weekdays) {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= last; day += 1) {
    const jsDay = new Date(year, monthIndex, day).getDay();
    const mondayIndex = jsDay === 0 ? 7 : jsDay;
    if (weekdays.includes(mondayIndex)) count += 1;
  }
  return count;
}

function selectedWeekdays() {
  return [...document.querySelectorAll('input[name="workday"]:checked')].map((node) => Number(node.value));
}

function setupOvertime(kind) {
  const form = document.querySelector(`[data-calc="${kind}"]`);
  if (!form) return;
  const calculate = () => {
    const salary = numberValue('netSalary');
    const hours = numberValue('dailyHours');
    const overtime = numberValue('overtimeHours');
    const factor = numberValue('factor');
    const [year, month] = document.getElementById('workMonth').value.split('-').map(Number);
    const days = workdayCount(year, month - 1, selectedWeekdays());
    const hourly = days && hours ? salary / (days * hours) : 0;
    const value = hourly * overtime * factor;
    setText('workdays', `${days} gün`);
    setText('hourly', trMoney.format(hourly));
    setText('overtimeValue', trMoney.format(value));
    setText('dailyValue', trMoney.format(days ? salary / days : 0));
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); calculate(); });
  form.querySelectorAll('input,select').forEach((input) => input.addEventListener('change', calculate));
  calculate();
}

function setupTaxBracket() {
  const form = document.querySelector('[data-calc="tax-bracket"]');
  if (!form) return;
  const calculate = () => {
    const prior = toCents(numberValue('taxPrior'));
    const gross = numberValue('taxGross');
    const month = Number(document.getElementById('taxMonth').value);
    const slip = grossToNet(gross, prior, month);
    const next = prior + slip.base;
    const currentRate = marginalRate(prior);
    const nextRate = marginalRate(next);
    setText('taxNet', money(slip.net));
    setText('taxBaseMonth', money(slip.base));
    setText('taxNewBase', money(next));
    setText('taxCurrentRate', `%${trNumber.format(currentRate)}`);
    setText('taxNextRate', `%${trNumber.format(nextRate)}`);
    setText('taxMessage', currentRate === nextRate ? 'Bu ay içinde yeni bir dilime geçiş görünmüyor.' : `Bu ay marjinal oran %${trNumber.format(currentRate)} seviyesinden %${trNumber.format(nextRate)} seviyesine geçiyor.`);
  };
  form.addEventListener('submit', (event) => { event.preventDefault(); calculate(); });
  calculate();
}

setupGrossNet();
setupAnnual();
setupOvertime('overtime');
setupOvertime('rest-day');
setupTaxBracket();
