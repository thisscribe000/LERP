const questions = [
  ['Business & management', 'Is your business formally registered, financially organized (records & bank account), and equipped with basic export knowledge or personnel?'],
  ['Product readiness', 'Is your product consistent in quality, scalable in quantity, properly packaged/labeled, and suitable for international markets?'],
  ['Quality & compliance', 'Does your product meet required certifications, pass regulatory inspections, and comply with destination country standards?'],
  ['Finance & pricing', 'Do you fully understand your costs, can price profitably for export, handle international payments, and access funding if needed?'],
  ['Documentation & logistics', 'Do you understand export documentation, INCOTERMS, logistics processes, and have access to reliable shipping partners?'],
  ['Market & buyer readiness', 'Have you identified target markets and buyers, understand their requirements, and can professionally engage and negotiate using digital tools?']
];
let answers = Array(6).fill(null);
let displayedScore = 0;
const el = (id) => document.getElementById(id);
const isHostedPreview = location.hostname.endsWith('.chatgpt.site');
if (isHostedPreview) document.querySelector('.topbar').insertAdjacentHTML('afterend', '<aside class="preview-notice">Client preview — registration data is not collected on this temporary link.</aside>');
const questionHost = el('questions');
function renderQuestions() { questionHost.innerHTML = questions.map(([title, copy], index) => `<article class="question"><div class="q-number">${index + 1}</div><h3>${title}</h3><p>${copy}</p><div class="choices"><label class="choice"><input type="radio" name="answer-${index}" value="yes" ${answers[index] === true ? 'checked' : ''}> Yes</label><label class="choice"><input type="radio" name="answer-${index}" value="no" ${answers[index] === false ? 'checked' : ''}> No</label></div></article>`).join(''); }
function animateScore(score) { const start = displayedScore; const started = performance.now(); const tick = (now) => { const progress = Math.min(1, (now - started) / 280); const value = Math.round(start + (score - start) * (1 - Math.pow(1 - progress, 3))); el('score').innerHTML = `${value} <i>/ 6</i>`; if (progress < 1) requestAnimationFrame(tick); else displayedScore = score; }; requestAnimationFrame(tick); }
function updateScore() { const complete = answers.every(a => a !== null); const score = answers.filter(Boolean).length; animateScore(score); const result = el('result'); if (!answers.some(a => a !== null)) { result.className = 'result empty'; result.textContent = 'Choose an answer to begin'; return; } if (!complete) { result.className = 'result empty'; result.textContent = `${answers.filter(a => a !== null).length} of 6 answered`; return; } const label = score <= 2 ? 'Not Export Ready' : score <= 4 ? 'Almost Export Ready' : 'Export Ready'; result.className = `result ${score <= 2 ? 'not' : score <= 4 ? 'almost' : 'ready'}`; result.textContent = label; }
questionHost.addEventListener('change', (event) => { if (!event.target.name.startsWith('answer-')) return; answers[Number(event.target.name.replace('answer-', ''))] = event.target.value === 'yes'; const card = event.target.closest('.question'); card.querySelectorAll('.choice').forEach(choice => choice.classList.toggle('is-selected', choice.contains(event.target))); updateScore(); });
el('resetAssessment').addEventListener('click', () => { answers = Array(6).fill(null); renderQuestions(); updateScore(); });
renderQuestions(); updateScore();
const revealTargets = document.querySelectorAll('.intro,.assessment,.registration,.result-guide');
revealTargets.forEach(target => target.classList.add('reveal'));
const revealObserver = new IntersectionObserver((entries) => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); } }), { threshold: .12 });
revealTargets.forEach(target => revealObserver.observe(target));

const form = el('registrationForm');
form.addEventListener('submit', async (event) => { event.preventDefault(); const error = el('formError'); error.textContent = ''; if (!form.reportValidity()) return; if (isHostedPreview) { form.hidden = true; el('successMessage').textContent = 'This is a client preview, so your details have not been submitted or stored. The live registration link will collect registrations securely.'; el('success').hidden = false; return; } const payload = Object.fromEntries(new FormData(form)); payload.consent = form.elements.consent.checked; payload.assessmentAnswers = answers; const button = form.querySelector('[type="submit"]'); button.disabled = true; button.textContent = 'Submitting…'; try { const response = await fetch('/api/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not complete registration.'); form.hidden = true; el('success').hidden = false; } catch (err) { error.textContent = err.message; } finally { button.disabled = false; button.innerHTML = 'Complete registration <span>→</span>'; } });
el('registerAnother').addEventListener('click', () => { form.reset(); form.hidden = false; el('success').hidden = true; document.querySelector('#register').scrollIntoView({behavior:'smooth'}); });
