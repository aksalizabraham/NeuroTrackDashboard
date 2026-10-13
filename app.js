const exerciseCatalog = {
  wrist: [
    { id:'wrist_rest_tremor', name:'Resting tremor recording', instruction:'Support the forearm and relax the hand. Record movement without intentionally moving.', metrics:['Frequency','Amplitude'], output:'Tremor-pattern summary' },
    { id:'wrist_postural_tremor', name:'Postural tremor recording', instruction:'Hold the hand in a comfortable, prescribed position without resting it on the table.', metrics:['Frequency','Amplitude','Stability'], output:'Postural movement summary' },
    { id:'wrist_flex_ext', name:'Wrist flexion / extension', instruction:'With the forearm supported, gently bend the wrist up and down at a comfortable pace.', metrics:['Repetitions','Angular speed','Range'], output:'Movement performance summary' }
  ],
  forearm: [
    { id:'forearm_pronation', name:'Forearm pronation / supination', instruction:'With the elbow supported, rotate the forearm gently between palm-up and palm-down positions.', metrics:['Repetitions','Angular speed','Duration'], output:'Forearm movement summary' },
    { id:'forearm_flex_ext', name:'Wrist flexion / extension', instruction:'Keep the forearm supported and move the wrist up and down in a controlled manner.', metrics:['Repetitions','Range','Consistency'], output:'Exercise performance summary' },
    { id:'forearm_reach', name:'Repeated reaching', instruction:'Perform a comfortable, clinician-selected reaching task in a seated position.', metrics:['Duration','Smoothness','Consistency'], output:'Task performance summary' }
  ],
  head: [
    { id:'head_horizontal', name:'Horizontal head turns', instruction:'While seated, perform slow, comfortable left-right head turns. Use only a clinician-approved range.', metrics:['Angular speed','Range','Repetitions'], output:'Head-motion summary' },
    { id:'head_vertical', name:'Vertical head movements', instruction:'While seated, perform slow, comfortable up-down head movements within an approved range.', metrics:['Angular speed','Range','Consistency'], output:'Head-motion summary' },
    { id:'head_gaze', name:'Gaze-stabilization practice', instruction:'Only if prescribed: look at a stationary target while making small, controlled head movements.', metrics:['Angular speed','Duration','Consistency'], output:'Exercise performance summary' }
  ],
  ankle: [
    { id:'ankle_dorsi', name:'Ankle dorsiflexion / plantarflexion', instruction:'While seated and supported, gently move the foot up and down.', metrics:['Repetitions','Range','Angular speed'], output:'Ankle movement summary' },
    { id:'ankle_circles', name:'Ankle circles', instruction:'While seated, make slow, comfortable ankle circles if appropriate for the user.', metrics:['Duration','Consistency','Range'], output:'Ankle movement summary' },
    { id:'ankle_repeated', name:'Repeated ankle movement', instruction:'Repeat the prescribed ankle movement at a comfortable pace.', metrics:['Repetitions','Duration','Consistency'], output:'Exercise performance summary' }
  ]
};
const patients = {
  'P-001': { name:'Demo patient A', initials:'A', meta:'P-001 · Demo profile', sessions:4, last:'Oct 10' },
  'P-002': { name:'Demo patient B', initials:'B', meta:'P-002 · Demo profile', sessions:7, last:'Oct 12' },
  'P-003': { name:'Demo patient C', initials:'C', meta:'P-003 · Demo profile', sessions:2, last:'Oct 08' }
};
let history = [];
let running = false;
let startedAt = 0;
let timerHandle = null;
let activeExercise = null;
let duration = 30;
let lastResult = null;
let todayCount = 0;
const $ = id => document.getElementById(id);

function updateExerciseOptions() {
  const placement = $('placementSelect').value;
  const select = $('exerciseSelect');
  select.innerHTML = '';
  exerciseCatalog[placement].forEach((ex, i) => {
    const option = document.createElement('option'); option.value = ex.id; option.textContent = `${i+1}. ${ex.name}`; select.appendChild(option);
  });
  updateExerciseInfo();
}
function getExercise() {
  const list = exerciseCatalog[$('placementSelect').value];
  return list.find(ex => ex.id === $('exerciseSelect').value) || list[0];
}
function updateExerciseInfo() {
  const ex = getExercise();
  $('exerciseInfo').innerHTML = `<div class="info-icon">↗</div><div><strong>${ex.name}</strong><p>${ex.instruction}</p>${ex.metrics.map(m=>`<span class="metric-tag">${m}</span>`).join('')}</div>`;
}
function updatePatient() {
  const p = patients[$('patientSelect').value];
  $('patientName').textContent = p.name; $('patientMeta').textContent = p.meta;
  $('patientAvatar').textContent = p.initials; $('patientSessions').textContent = p.sessions;
  $('lastSession').textContent = p.last;
  renderPatientDirectory();
}
function fmtTime(seconds) { return `00:${String(Math.max(0, Math.floor(seconds))).padStart(2,'0')}`; }
function startSession() {
  if (running) return;
  activeExercise = getExercise(); duration = Number($('durationSelect').value);
  running = true; startedAt = Date.now();
  $('startBtn').disabled = true; $('stopBtn').disabled = false;
  $('sessionExercise').textContent = activeExercise.name;
  $('sessionMessage').textContent = 'Demo recording in progress. No live sensor data is being received.';
  $('sessionStatus').textContent = '● RECORDING'; $('sessionStatus').className = 'live-pill running';
  $('progressCaption').textContent = 'Recording simulated movement data';
  $('liveReps').textContent = '—'; $('liveQuality').textContent = 'Demo'; $('liveSamples').textContent = '—';
  tick(); timerHandle = setInterval(tick, 200);
}
function tick() {
  const elapsed = Math.min(duration, (Date.now()-startedAt)/1000);
  $('timerValue').textContent = fmtTime(elapsed);
  $('progressBar').style.width = `${Math.min(100, elapsed/duration*100)}%`;
  $('timerRing').style.background = `conic-gradient(var(--blue) ${elapsed/duration*360}deg,#e8edf7 0deg)`;
  $('progressCaption').textContent = `${Math.round(elapsed/duration*100)}% complete`;
  if (elapsed >= duration) finishSession();
}
function finishSession() {
  if (!running) return;
  running = false; clearInterval(timerHandle); timerHandle = null;
  const placement = $('placementSelect').value;
  const isTremor = activeExercise.id.includes('tremor');
  // Explicitly illustrative demo values; replace with measurements from the ESP32.
  const result = {
    id: `DEMO-${Date.now().toString().slice(-6)}`,
    patientId: $('patientSelect').value,
    patientName: patients[$('patientSelect').value].name,
    placement, exerciseId: activeExercise.id, exerciseName: activeExercise.name,
    duration, date: new Date(),
    score: isTremor ? null : 72 + Math.floor(Math.random()*20),
    frequency: isTremor ? (4.2 + Math.random()*2.2).toFixed(1) : null,
    amplitude: isTremor ? (0.05 + Math.random()*0.15).toFixed(3) : null,
    reps: isTremor ? null : 6 + Math.floor(Math.random()*6),
    quality: ['Good','Fair'][Math.floor(Math.random()*2)],
    output: activeExercise.output
  };
  lastResult = result; history.unshift(result); todayCount++;
  $('startBtn').disabled = false; $('stopBtn').disabled = true;
  $('sessionStatus').textContent = '● COMPLETED'; $('sessionStatus').className = 'live-pill done';
  $('sessionMessage').textContent = 'Demo session complete. Results below are simulated for interface testing.';
  $('progressCaption').textContent = 'Session finished';
  $('liveReps').textContent = result.reps ?? 'N/A'; $('liveQuality').textContent = result.quality; $('liveSamples').textContent = `${duration*100}`;
  $('todayCount').textContent = todayCount;
  patients[result.patientId].sessions++;
  patients[result.patientId].last = 'Today';
  updatePatient(); renderRecent(); renderReport(result);
}
function stopSession() { if (running) { duration = Math.max(1, (Date.now()-startedAt)/1000); finishSession(); } }
function renderRecent() {
  const list = $('recentList');
  if (!history.length) { list.innerHTML = '<div class="empty-state"><span>◷</span><p>Your completed demo sessions will appear here.</p></div>'; return; }
  list.innerHTML = history.slice(0,4).map(r=>`<div class="recent-item"><div class="recent-icon">◷</div><div class="recent-copy"><strong>${r.exerciseName}</strong><span>${r.patientId} · ${r.date.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div><div class="recent-score">${r.score == null ? 'Logged' : r.score}</div></div>`).join('');
}
function renderReport(r) {
  const scoreStat = r.score == null ? `<div class="report-stat"><span>Frequency (demo)</span><strong>${r.frequency} Hz</strong></div>` : `<div class="report-stat"><span>Demo task score</span><strong>${r.score}/100</strong></div>`;
  $('reportContent').innerHTML = `<div class="notice"><span class="notice-icon">ⓘ</span><div><strong>Simulated report</strong><p>All numerical results below are generated for the UI demo. They are not measured from the MPU6050 and must not be used for clinical decisions.</p></div></div><div class="report-summary"><div class="report-stat"><span>Patient</span><strong>${r.patientId}</strong></div><div class="report-stat"><span>Assessment</span><strong>${r.placement}</strong></div>${scoreStat}</div><h4>${r.exerciseName}</h4><p class="muted-note">Recorded ${r.date.toLocaleString()} · Duration ${r.duration}s · Demo signal quality: ${r.quality}</p><table class="report-table"><thead><tr><th>Metric</th><th>Demo result</th><th>Interpretation</th></tr></thead><tbody>${r.frequency != null ? `<tr><td>Dominant frequency</td><td>${r.frequency} Hz</td><td>Illustrative only</td></tr><tr><td>Signal amplitude</td><td>${r.amplitude} g</td><td>Illustrative only</td></tr>` : `<tr><td>Repetition count</td><td>${r.reps}</td><td>Illustrative only</td></tr><tr><td>Task performance score</td><td>${r.score}/100</td><td>Not a validated clinical score</td></tr>`}<tr><td>Recording duration</td><td>${r.duration} seconds</td><td>Configured duration</td></tr></tbody></table><div class="report-copy" style="margin-top:18px"><strong>AI summary preview</strong><br>This demo report shows how session details and measured features could be summarized. Once connected to the device, generate the summary from validated sensor measurements and compare only with prior recordings from the same placement and task.</div><button class="secondary-button" style="margin-top:15px" id="downloadReportBtn">↓ Download demo report (CSV)</button>`;
  $('downloadReportBtn').addEventListener('click', ()=>downloadCsv(r));
}
function downloadCsv(r) {
  const rows = [['field','value'],['demo_mode','true'],['patient_id',r.patientId],['session_id',r.id],['placement',r.placement],['exercise_id',r.exerciseId],['exercise_name',r.exerciseName],['duration_seconds',r.duration],['score_demo',r.score ?? 'not_applicable'],['frequency_hz_demo',r.frequency ?? 'not_applicable'],['amplitude_g_demo',r.amplitude ?? 'not_applicable'],['repetitions_demo',r.reps ?? 'not_applicable'],['signal_quality_demo',r.quality],['timestamp',r.date.toISOString()]];
  const csv = rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); const a = document.createElement('a'); a.href=url; a.download=`${r.id}-demo-report.csv`; a.click(); URL.revokeObjectURL(url);
}
function renderPatientDirectory() {
  $('patientDirectory').innerHTML = Object.entries(patients).map(([id,p])=>`<div class="directory-card"><div class="patient-avatar">${p.initials}</div><h4>${p.name}</h4><p>${id} · Fictional demo profile</p><p>${p.sessions} example sessions · Last: ${p.last}</p><button class="secondary-button" data-patient="${id}">Select profile</button></div>`).join('');
  $('patientDirectory').querySelectorAll('[data-patient]').forEach(btn=>btn.addEventListener('click',()=>{ $('patientSelect').value=btn.dataset.patient; updatePatient(); showView('assessment'); }));
}
function showView(view) {
  $('assessmentView').classList.toggle('hidden', view !== 'assessment');
  $('reportView').classList.toggle('hidden', view !== 'reports');
  $('patientsView').classList.toggle('hidden', view !== 'patients');
  $('pageTitle').textContent = view==='patients' ? 'Patient profiles' : view==='reports' ? 'Session reports' : 'Assessment workspace';
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  if (view==='reports' && lastResult) renderReport(lastResult);
}
$('placementSelect').addEventListener('change', updateExerciseOptions);
$('exerciseSelect').addEventListener('change', updateExerciseInfo);
$('patientSelect').addEventListener('change', updatePatient);
$('startBtn').addEventListener('click', startSession);
$('stopBtn').addEventListener('click', stopSession);
$('viewReportsBtn').addEventListener('click',()=>showView('reports'));
$('backBtn').addEventListener('click',()=>showView('assessment'));
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('todayLabel').textContent = new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase();
updateExerciseOptions(); updatePatient(); renderRecent(); renderPatientDirectory();
