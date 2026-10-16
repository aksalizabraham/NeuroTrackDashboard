const catalog = {
 wrist:[
  {id:'wrist_rest',cmd:'1',name:'Resting wrist stillness',instruction:'Support the forearm and relax the hand. Do not intentionally move.',metrics:['Gyroscope RMS','Acceleration variability']},
  {id:'wrist_posture',cmd:'2',name:'Wrist postural hold',instruction:'Hold the hand in a comfortable, consistent position.',metrics:['Gyroscope RMS','Motion variability']},
  {id:'wrist_flex_ext',cmd:'3',name:'Wrist flexion / extension',instruction:'With the forearm supported, gently bend the wrist up and down.',metrics:['Repetitions*','Angular speed']}
 ],
 forearm:[
  {id:'forearm_pron_sup',cmd:'4',name:'Forearm pronation / supination',instruction:'With elbow supported, gently rotate palm-up and palm-down.',metrics:['Repetitions*','Angular speed']}
 ],
 head:[
  {id:'head_still',cmd:'5',name:'Head stillness',instruction:'Sit supported and hold the head comfortably in a neutral position.',metrics:['Gyroscope RMS','Motion variability']},
  {id:'head_horizontal',cmd:'6',name:'Slow left / right head turns',instruction:'While seated, make small, slow, comfortable turns. Do not force the range.',metrics:['Repetitions*','Angular speed']},
  {id:'head_vertical',cmd:'7',name:'Slow up / down head tilts',instruction:'While seated, make small, comfortable up/down head movements.',metrics:['Repetitions*','Angular speed']}
 ],
 ankle:[
  {id:'ankle_still',cmd:'8',name:'Ankle stillness',instruction:'Sit with the leg supported and foot relaxed.',metrics:['Gyroscope RMS','Motion variability']},
  {id:'ankle_dorsi',cmd:'9',name:'Ankle dorsiflexion / plantarflexion',instruction:'While seated and supported, gently move the foot up and down.',metrics:['Repetitions*','Angular speed']}
 ]
};
const defaultPeople={
 'NT-001':{name:'Team member 1',initials:'T1',sessions:0,last:'No sessions yet'},
 'NT-002':{name:'Team member 2',initials:'T2',sessions:0,last:'No sessions yet'},
 'NT-003':{name:'Team member 3',initials:'T3',sessions:0,last:'No sessions yet'}
};
const KEY='neurotrack_pilot_v1';
let people={...defaultPeople},history=[],port=null,reader=null,writer=null;
let running=false,startedAt=0,timer=null,exercise=null,samples=[],chartVals=[],summary={},lastResult=null,buffer='';
let angleBaseline=null,anglePeakDeg=0,angleTrace=[];
let activeProfileTab='recordings', profileReturnView='profile';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s.people)people={...defaultPeople,...s.people};if(Array.isArray(s.history))history=s.history.map(r=>({...r,date:new Date(r.date),samples:[]}));lastResult=history[0]||null;}catch(e){console.warn(e)}
}
function save(){
 // Keep full raw arrays in memory for export; persist summaries only to avoid filling browser storage.
 const compact=history.slice(0,100).map(r=>({...r,samples:undefined}));
 try{localStorage.setItem(KEY,JSON.stringify({people,history:compact}));}catch(e){setMsg('Local storage is full. Download the CSV files for safekeeping.',true)}
}
function populatePeople(){
 const sel=$('patientSelect'),current=sel.value;sel.innerHTML='';
 Object.entries(people).forEach(([id,p])=>{const o=document.createElement('option');o.value=id;o.textContent=`${id} · ${p.name}`;sel.appendChild(o)});
 sel.value=people[current]?current:Object.keys(people)[0];
}
function addPerson(){
 const name=$('newParticipantName').value.trim();if(!name){alert('Enter a teammate name first.');return}
 let n=Object.keys(people).length+1,id;do{id=`NT-${String(n++).padStart(3,'0')}`}while(people[id]);
 people[id]={name,initials:name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase(),sessions:0,last:'No sessions yet'};
 $('newParticipantName').value='';populatePeople();$('patientSelect').value=id;save();updatePerson();renderPeople();showView('patients');
}
function updatePerson(){
 const id=$('patientSelect').value,p=people[id];if(!p)return;
 $('patientName').textContent=p.name;$('patientMeta').textContent=`${id} · Local pilot profile`;
 $('patientAvatar').textContent=p.initials||p.name.slice(0,2).toUpperCase();$('patientSessions').textContent=p.sessions||0;
 $('lastSession').textContent=p.last||'No sessions yet';$('profileFoot').textContent='Local participant profile';renderPeople();
}
function updateExercises(){
 const list=catalog[$('placementSelect').value]||[],sel=$('exerciseSelect');sel.innerHTML='';
 list.forEach((e,i)=>{const o=document.createElement('option');o.value=e.id;o.textContent=`${i+1}. ${e.name}`;sel.appendChild(o)});
 showExercise();
}
function getExercise(){return (catalog[$('placementSelect').value]||[]).find(e=>e.id===$('exerciseSelect').value)}
function showExercise(){const e=getExercise();if(!e)return;$('exerciseInfo').innerHTML=`<div class="info-icon">↗</div><div><strong>${esc(e.name)}</strong><p>${esc(e.instruction)}</p>${e.metrics.map(m=>`<span class="metric-tag">${esc(m)}</span>`).join('')}</div>`}
function connection(on){
 $('startBtn').disabled=!on||running;$('sensorStateTitle').textContent=on?'ESP32 connected':'Sensor not connected';
 $('sensorStateText').textContent=on?'Ready for real recording':'Connect ESP32 by USB';
 $('sensorDot').style.background=on?'#20a78a':'#e6a343';$('sidebarConnectionDot').style.background=on?'#20a78a':'#e6a343';
 $('connectionLabel').textContent=on?'ESP32 connected':'Device disconnected';$('connectionSubLabel').textContent=on?'USB serial ready':'Connect ESP32 by USB';
 $('modePill').innerHTML=`<span></span> ${on?'DEVICE CONNECTED':'HARDWARE MODE'}`;
 $('topNoticeText').textContent=on?'Connected to ESP32. Real MPU6050 samples will be captured. Sessions are saved in this browser; Firebase is not connected.':'Connect the ESP32 in desktop Chrome/Edge to record real data. Sessions are saved locally; Firebase is not connected.';
}
async function connect(){
 if(!('serial'in navigator)){alert('Web Serial requires desktop Chrome/Edge and localhost or HTTPS.');return}
 try{
  if(port){await disconnect();return}
  port=await navigator.serial.requestPort();await port.open({baudRate:115200});writer=port.writable.getWriter();
  connection(true);$('connectBtn').textContent='Disconnect device';$('sessionMessage').textContent='Device connected. Select an exercise and start a recording.';
  serialLoop();
 }catch(e){console.error(e);port=null;writer=null;connection(false);alert(`Connection failed: ${e.message||e}. Close Arduino Serial Monitor/Plotter first.`)}
}
async function disconnect(){
 try{if(reader){await reader.cancel();reader.releaseLock()}if(writer)writer.releaseLock();if(port)await port.close()}catch(e){console.warn(e)}
 port=null;reader=null;writer=null;$('connectBtn').textContent='Connect ESP32';connection(false);
}
async function serialLoop(){
 if(!port?.readable)return;reader=port.readable.getReader();const decoder=new TextDecoder();
 try{while(port&&reader){const {value,done}=await reader.read();if(done)break;if(value){buffer+=decoder.decode(value,{stream:true});let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i).trim();buffer=buffer.slice(i+1);if(line)handleLine(line)}}}}
 catch(e){if(port)console.error('Serial read error',e)}
 finally{try{reader?.releaseLock()}catch{}reader=null}
}
function handleLine(line){
 if(line.startsWith('#RESULT,')){const payload=line.slice(8);const eq=payload.indexOf('=');if(eq>0)summary[payload.slice(0,eq)]=payload.slice(eq+1);return}
 if(line.startsWith('#END,')){if(running)finish();return}
 if(line.startsWith('#ERROR,')){setMsg(line.slice(7),true);return}
 if(line.startsWith('#')||line.startsWith('time_ms,'))return;
 const c=line.split(',');if(c.length<9||!running)return;
 const s={timeMs:+c[0],exercise:c[1],ax:+c[2],ay:+c[3],az:+c[4],gx:+c[5],gy:+c[6],gz:+c[7],reps:+c[8]};
 if(!Number.isFinite(s.timeMs)||!Number.isFinite(s.gy))return;
 samples.push(s);chartVals.push(s.gy);if(chartVals.length>400)chartVals.shift();
 if(exercise?.id==='wrist_flex_ext'){
   const elapsed=(Date.now()-startedAt)/1000;
   if(elapsed<=2){
     const n=angleBaseline?.n||0;
     if(!angleBaseline)angleBaseline={n:0,x:0,y:0,z:0};
     angleBaseline.n=n+1;angleBaseline.x+=s.ax;angleBaseline.y+=s.ay;angleBaseline.z+=s.az;
   }else if(angleBaseline?.n){
     const bx=angleBaseline.x/angleBaseline.n,by=angleBaseline.y/angleBaseline.n,bz=angleBaseline.z/angleBaseline.n;
     const bm=Math.sqrt(bx*bx+by*by+bz*bz),sm=Math.sqrt(s.ax*s.ax+s.ay*s.ay+s.az*s.az);
     if(bm>0&&sm>0){
       const dot=Math.max(-1,Math.min(1,(bx*s.ax+by*s.ay+bz*s.az)/(bm*sm)));
       const deg=Math.acos(dot)*180/Math.PI;
       angleTrace.push({timeMs:s.timeMs,angleDeg:deg});
       if(deg>anglePeakDeg)anglePeakDeg=deg;
       $('angleLiveValue').textContent=`${deg.toFixed(1)}°`;
       $('anglePeakValue').textContent=`${anglePeakDeg.toFixed(1)}°`;
     }
   }
 }
 $('liveSamples').textContent=samples.length;$('liveReps').textContent=s.reps;$('liveQuality').textContent='Receiving';
 $('chartSubLabel').textContent=`${samples.length} real samples · gyroscope Y`;drawChart();
}
function setMsg(msg,error=false){$('sessionMessage').textContent=msg;$('sessionMessage').style.color=error?'#b54747':''}
async function start(){
 if(running)return;if(!port||!writer){alert('Connect the ESP32 first. This build does not generate fake sensor data.');return}
 exercise=getExercise();if(!exercise)return;samples=[];chartVals=[];summary={};angleBaseline=null;anglePeakDeg=0;angleTrace=[];running=true;startedAt=Date.now();
 $('angleLiveValue').textContent='—';$('anglePeakValue').textContent='—';
 if(exercise.id==='wrist_flex_ext')setMsg('ANGLE TEST: keep the wrist neutral and still for 2 seconds. At the cue, slowly lift the hand, then return comfortably.');
 $('startBtn').disabled=true;$('stopBtn').disabled=false;$('downloadRawBtn').disabled=true;
 $('sessionExercise').textContent=exercise.name;setMsg('Recording real MPU6050 samples. Keep the sensor secure and follow the task instructions.');
 $('sessionStatus').textContent='● RECORDING';$('sessionStatus').className='live-pill running';$('progressCaption').textContent='Waiting for sensor samples…';
 $('liveReps').textContent='—';$('liveQuality').textContent='Waiting';$('liveSamples').textContent='0';
 try{await writer.write(new TextEncoder().encode(exercise.cmd))}catch(e){running=false;connection(false);alert(`Could not send command: ${e.message||e}`);return}
 tick();timer=setInterval(tick,100);
}
function tick(){
 if(!running)return;const elapsed=Math.min(20,(Date.now()-startedAt)/1000);
 $('timerValue').textContent=`00:${String(Math.floor(elapsed)).padStart(2,'0')}`;
 $('progressBar').style.width=`${elapsed/20*100}%`;$('timerRing').style.background=`conic-gradient(var(--blue) ${elapsed/20*360}deg,#e8edf7 0deg)`;
 $('progressCaption').textContent=`${Math.round(elapsed/20*100)}% complete`;
 if(exercise?.id==='wrist_flex_ext'){
   $('angleCue').classList.toggle('active',elapsed>=2&&elapsed<20);
   $('angleCue').textContent=elapsed<2?`BASELINE · keep wrist still (${Math.max(0,2-elapsed).toFixed(1)} s)`:'MOVE UP NOW · then return slowly';
   $('progressCaption').textContent=elapsed<2?'Baseline: keep wrist neutral and still':elapsed<20?'Move slowly after the cue':'20 seconds elapsed · waiting for device summary';
 }
 if(elapsed>=20&& !summary.samples){$('progressCaption').textContent='20 seconds elapsed · waiting for device summary';}
}
function vectorRms(rows,keys){
 if(!rows.length)return null;const means={};keys.forEach(k=>means[k]=rows.reduce((a,s)=>a+s[k],0)/rows.length);
 return Math.sqrt(keys.reduce((acc,k)=>acc+rows.reduce((a,s)=>a+(s[k]-means[k])**2,0)/rows.length,0));
}
function finish(){
 if(!running)return;running=false;if(timer)clearInterval(timer);timer=null;
 const date=new Date(),pid=$('patientSelect').value,secs=samples.length>1?(samples.at(-1).timeMs-samples[0].timeMs)/1000:0;
 const result={id:`NT-${date.getTime()}`,participantId:pid,participantName:people[pid]?.name||pid,placement:$('placementSelect').value,
 exerciseId:exercise.id,exerciseName:exercise.name,duration:Number(secs.toFixed(2)),date:date.toISOString(),sampleCount:samples.length,
 samples:samples.slice(),gyroRms:vectorRms(samples,['gx','gy','gz']),accelVariability:vectorRms(samples,['ax','ay','az']),repetitions:samples.length?samples.at(-1).reps:null,
 anglePeakDeg:exercise.id==='wrist_flex_ext'&&angleTrace.length?+anglePeakDeg.toFixed(1):null,
 angleTrace:angleTrace.slice(),angleMethod:exercise.id==='wrist_flex_ext'?'accelerometer gravity-vector angle from first 2-second baseline':'not_applicable',
 dataSource:'ESP32_MPU6050_REAL',deviceSummary:{...summary}};
 if(result.gyroRms!=null)result.gyroRms=+result.gyroRms.toFixed(3);if(result.accelVariability!=null)result.accelVariability=+result.accelVariability.toFixed(4);
 lastResult=result;history.unshift(result);if(people[pid]){people[pid].sessions=(people[pid].sessions||0)+1;people[pid].last=date.toLocaleDateString()}
 save();$('startBtn').disabled=!port;$('stopBtn').disabled=true;$('downloadRawBtn').disabled=!samples.length;
 $('sessionStatus').textContent='● COMPLETED';$('sessionStatus').className='live-pill done';
 setMsg(samples.length?`Completed: captured ${samples.length} real sensor samples.`:'No valid samples received. Check the port, wiring and firmware.',!samples.length);
 $('progressCaption').textContent='Session finished';$('liveReps').textContent=result.repetitions??'—';
 $('liveQuality').textContent=samples.length>=1500?'Captured':samples.length?'Check sample count':'No data';$('liveSamples').textContent=samples.length;
 $('todayCount').textContent=Number($('todayCount').textContent||0)+1;updatePerson();renderRecent();renderReport(result);renderPeople();if(!$('patientProfileView').classList.contains('hidden'))renderProfile();
}
function stop(){if(!running)return;setMsg('The firmware records a fixed 20-second trial. Allow it to finish so its summary is complete.')}
function csvCell(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function download(text,name,type='text/csv'){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
function rawCsv(r){const rows=[['time_ms','exercise','ax_g','ay_g','az_g','gx_dps','gy_dps','gz_dps','rep_count'],...(r.samples||[]).map(s=>[s.timeMs,s.exercise,s.ax,s.ay,s.az,s.gx,s.gy,s.gz,s.reps])];return rows.map(row=>row.map(csvCell).join(',')).join('\n')}
function downloadRaw(r){download(rawCsv(r),`${r.id}-raw-samples.csv`)}
function downloadSummary(r){
 const rows=[['field','value'],['data_source',r.dataSource],['participant_id',r.participantId],['session_id',r.id],['placement',r.placement],['exercise_id',r.exerciseId],['exercise_name',r.exerciseName],['duration_seconds',r.duration],['sample_count',r.sampleCount],['gyro_vector_rms_dps',r.gyroRms],['acceleration_variability_g',r.accelVariability],['detected_repetitions',r.repetitions],['estimated_peak_excursion_deg',r.anglePeakDeg],['angle_method',r.angleMethod],['timestamp',r.date],['clinical_validation','not_performed']];
 download(rows.map(row=>row.map(csvCell).join(',').replace(/\n/g,'')).join('\n'),`${r.id}-summary.csv`);
}
function renderRecent(){
 const el=$('recentList');if(!history.length){el.innerHTML='<div class="empty-state"><span>◷</span><p>No recordings yet. Connect the ESP32 and record a trial.</p></div>';return}
 el.innerHTML=history.slice(0,5).map(r=>`<button type="button" class="recent-item recent-item-button" data-report-id="${esc(r.id)}"><div class="recent-icon">◷</div><div class="recent-copy"><strong>${esc(r.exerciseName)}</strong><span>${esc(r.participantId)} · ${new Date(r.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span></div><div class="recent-score">${r.sampleCount||0} samples</div></button>`).join('');
 el.querySelectorAll('[data-report-id]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.reportId)));
}
function renderReport(r){
 if(!r)return;const list=$('reportHistoryList');if(list){list.innerHTML=`<h4>All saved sessions (${history.length})</h4>`+history.map((item,i)=>`<button type="button" class="report-history-item ${item.id===r.id?'selected':''}" data-report-id="${esc(item.id)}"><span><strong>${esc(item.exerciseName)}</strong><small>${esc(item.participantId)} · ${new Date(item.date).toLocaleString()} · ${esc(item.placement)}</small></span><b>${item.sampleCount||0} samples</b></button>`).join('');list.querySelectorAll('[data-report-id]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.reportId)));}const stat=(label,val,unit='')=>`<div class="report-stat"><span>${esc(label)}</span><strong>${val==null?'—':esc(val)+esc(unit)}</strong></div>`;
 const rows=[['Raw samples captured',r.sampleCount,'Samples received by browser'],['Gyroscope vector RMS',r.gyroRms==null?null:r.gyroRms+' °/s','Variation of three-axis angular velocity'],['Acceleration variability',r.accelVariability==null?null:r.accelVariability+' g','Variation of three-axis acceleration'],['Detected repetitions',r.repetitions,'Firmware estimate; requires calibration']];
 if(r.exerciseId==='wrist_flex_ext')rows.push(['Estimated peak angular excursion',r.anglePeakDeg==null?null:r.anglePeakDeg+'°','Accelerometer gravity-vector change relative to the first 2 seconds; approximate only']);
 $('reportContent').innerHTML=`<div class="notice"><span class="notice-icon">ⓘ</span><div><strong>Engineering pilot result</strong><p>Values are calculated from actual serial samples. They are not validated clinical measurements and cannot diagnose a condition.</p></div></div><div class="report-summary">${stat('Participant',r.participantId)}${stat('Body region',r.placement)}${stat('Raw samples',r.sampleCount)}</div><h4>${esc(r.exerciseName)}</h4><p class="muted-note">Recorded ${new Date(r.date).toLocaleString()} · ${r.duration}s · ESP32 + MPU6050</p><table class="report-table"><thead><tr><th>Metric</th><th>Measured result</th><th>Meaning</th></tr></thead><tbody>${rows.map(([n,v,m])=>`<tr><td>${esc(n)}</td><td>${v==null?'—':esc(v)}</td><td>${esc(m)}</td></tr>`).join('')}</tbody></table><p class="muted-note">Compare only recordings with the same placement, task and instructions. Changes do not by themselves prove recovery or disease severity. Angle is a preliminary gravity-vector estimate and can be inaccurate during fast movement, sensor slippage, or non-standard mounting; validate against a known angle before relying on it.</p><div class="device-buttons"><button class="secondary-button" id="downloadSummaryBtn">Download summary CSV</button><button class="secondary-button" id="downloadReportRawBtn">Download raw samples CSV</button></div>`;
 $('downloadSummaryBtn').addEventListener('click',()=>downloadSummary(r));$('downloadReportRawBtn').addEventListener('click',()=>downloadRaw(r));
}
function openReport(id){const r=history.find(item=>item.id===id);if(!r)return;lastResult=r;profileReturnView='profile';showView('reports');renderReport(r)}
function renderPeople(){
 const el=$('patientDirectory');if(!el)return;
 el.innerHTML=Object.entries(people).map(([id,p])=>{
   const count=history.filter(r=>r.participantId===id).length;
   const latest=history.filter(r=>r.participantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
   return `<button type="button" class="directory-card patient-card-button" data-person="${esc(id)}"><div class="directory-card-top"><div class="patient-avatar">${esc(p.initials||p.name.slice(0,2))}</div><span class="directory-open">Open profile →</span></div><h4>${esc(p.name)}</h4><p>${esc(id)} · Local pilot profile</p><div class="directory-metrics"><span><strong>${count}</strong> recordings</span><span><strong>${latest?esc(new Date(latest.date).toLocaleDateString()):'—'}</strong> last visit</span></div></button>`;
 }).join('');
 el.querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>{
   const id=b.dataset.person;$('patientSelect').value=id;updatePerson();activeProfileTab='recordings';showView('profile');
 }));
}
function renderProfile(){
 const id=$('patientSelect').value,p=people[id];if(!p)return;
 const rows=history.filter(r=>r.participantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
 $('profileAvatar').textContent=p.initials||p.name.slice(0,2).toUpperCase();$('profileName').textContent=p.name;$('profileMeta').textContent=`${id} · Anonymous pilot profile`;
 const latest=rows[0];
 $('profileStats').innerHTML=`<div class="profile-stat"><span>Total recordings</span><strong>${rows.length}</strong></div><div class="profile-stat"><span>Assessment days</span><strong>${new Set(rows.map(r=>new Date(r.date).toLocaleDateString())).size}</strong></div><div class="profile-stat"><span>Last recording</span><strong>${latest?esc(new Date(latest.date).toLocaleDateString()):'Not yet'}</strong></div><div class="profile-stat"><span>Body regions</span><strong>${new Set(rows.map(r=>r.placement)).size}</strong></div>`;
 $('profileSessionCount').textContent=`${rows.length} session${rows.length===1?'':'s'}`;$('profileReportCount').textContent=`${rows.length} report${rows.length===1?'':'s'}`;
 const sessions=$('profileSessionsContent'),reports=$('profileReportsContent');
 if(!rows.length){sessions.innerHTML='<div class="profile-empty"><span>◷</span><h3>No sessions recorded yet</h3><p>Use “Start assessment” above to record this patient’s first session.</p></div>';}else{
  const days=[...new Set(rows.map(r=>new Date(r.date).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'short',day:'numeric'})))];
  sessions.innerHTML=days.map(day=>{const dayRows=rows.filter(r=>new Date(r.date).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'short',day:'numeric'})===day);return `<section class="recording-day"><div class="recording-day-heading"><h4>${esc(day)}</h4><span>${dayRows.length} recording${dayRows.length===1?'':'s'}</span></div><div class="profile-recording-list">${dayRows.map(r=>`<article class="profile-recording"><div class="recording-icon">${esc((r.placement||'?').slice(0,1).toUpperCase())}</div><div class="recording-main"><strong>${esc(r.exerciseName)}</strong><span>${esc(r.placement)} · ${new Date(r.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · ${r.duration||20}s</span><small>${r.sampleCount||0} samples · ${r.repetitions==null?'Reps —':`${r.repetitions} reps`} · ${r.gyroRms==null?'Gyro RMS —':`Gyro RMS ${r.gyroRms} °/s`}</small></div><div class="recording-actions"><button type="button" class="secondary-button" data-profile-report="${esc(r.id)}">Open report</button><button type="button" class="text-button" data-profile-raw="${esc(r.id)}">Raw CSV</button></div></article>`).join('')}</div></section>`}).join('');
 }
 sessions.querySelectorAll('[data-profile-report]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.profileReport)));
 sessions.querySelectorAll('[data-profile-raw]').forEach(b=>b.addEventListener('click',()=>{const r=history.find(x=>x.id===b.dataset.profileRaw);if(r)downloadRaw(r)}));
 reports.innerHTML=rows.length?`<div class="profile-table-wrap"><table class="report-table"><thead><tr><th>Date / time</th><th>Body region</th><th>Assessment</th><th>Samples</th><th>Result</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(new Date(r.date).toLocaleString())}</td><td>${esc(r.placement)}</td><td>${esc(r.exerciseName)}</td><td>${r.sampleCount||0}</td><td><button type="button" class="secondary-button" data-profile-report="${esc(r.id)}">Open report</button></td></tr>`).join('')}</tbody></table></div><p class="muted-note">Reports are based on samples received by the dashboard. Raw samples are not retained after page reload; download the raw CSV after each recording.</p>`:'<div class="profile-empty"><h3>No reports yet</h3><p>Reports will appear here after an assessment is completed.</p></div>';
 reports.querySelectorAll('[data-profile-report]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.profileReport)));
 $('profileProgressTable').innerHTML=rows.length?`<table class="report-table"><thead><tr><th>Date / time</th><th>Body region</th><th>Assessment</th><th>Gyro RMS</th><th>Repetitions</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(new Date(r.date).toLocaleString())}</td><td>${esc(r.placement)}</td><td>${esc(r.exerciseName)}</td><td>${r.gyroRms==null?'—':esc(r.gyroRms)}</td><td>${r.repetitions==null?'—':esc(r.repetitions)}</td></tr>`).join('')}</tbody></table>`:'<div class="profile-empty"><h3>No progress data yet</h3><p>Complete assessments on different visits to build a progress history.</p></div>';
 drawProfileProgress(rows);
 $('profileExportProgress').onclick=()=>{const out=[['participant_id','session_id','timestamp','placement','exercise_id','exercise_name','duration_seconds','sample_count','gyro_vector_rms_dps','acceleration_variability_g','detected_repetitions','estimated_peak_excursion_deg'],...rows.slice().reverse().map(r=>[r.participantId,r.id,r.date,r.placement,r.exerciseId,r.exerciseName,r.duration,r.sampleCount,r.gyroRms,r.accelVariability,r.repetitions,r.anglePeakDeg])];download(out.map(row=>row.map(csvCell).join(',')).join('\n'),`${id}-progress.csv`)};
}
function drawProfileProgress(rows){
 const c=$('profileProgressChart');if(!c)return;const rect=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(300,rect.width),h=250;c.width=Math.floor(w*dpr);c.height=Math.floor(h*dpr);const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const pad=36;ctx.strokeStyle='#e7ebf2';ctx.fillStyle='#7b8798';ctx.font='10px sans-serif';for(let i=0;i<5;i++){const y=pad+i*(h-2*pad)/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-12,y);ctx.stroke()}const valid=rows.filter(r=>Number.isFinite(Number(r.gyroRms)));if(!valid.length){ctx.fillText('No measured values to chart yet.',pad+8,h/2);$('profileProgressNote').textContent='Complete recordings to build this patient’s trend.';return}const max=Math.max(...valid.map(r=>Number(r.gyroRms)),1),min=Math.min(0,...valid.map(r=>Number(r.gyroRms))),range=max-min||1;ctx.strokeStyle='#3569e8';ctx.lineWidth=2;ctx.beginPath();valid.slice().reverse().forEach((r,i)=>{const x=pad+i*(w-pad-18)/Math.max(1,valid.length-1),y=pad+(max-Number(r.gyroRms))/range*(h-2*pad);if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();$('profileProgressNote').textContent=valid.length===1?'Only one session is available; record the same task again to compare.':'Trend uses saved session summaries. Compare like-for-like tasks and placements only.';
}
function showView(v){
 const isPatients=v==='patients',isProfile=v==='profile',isAssessment=v==='assessment',isReports=v==='reports',isProgress=v==='progress';
 $('assessmentView').classList.toggle('hidden',!isAssessment);$('reportView').classList.toggle('hidden',!isReports);$('patientsView').classList.toggle('hidden',!isPatients);$('patientProfileView').classList.toggle('hidden',!isProfile);$('progressView').classList.toggle('hidden',!isProgress);
 document.querySelector('.welcome-row').classList.toggle('hidden',!isAssessment);
 $('pageTitle').textContent=isPatients?'Patients':isProfile?'Patient profile':isReports?'Session report':isProgress?'Patient progress':'Assessment workspace';
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v||((v==='profile'||v==='assessment'||v==='reports'||v==='progress')&&b.dataset.view==='patients')));
 if(isProfile)renderProfile();
 if(isReports){if(lastResult)renderReport(lastResult);else $('reportHistoryList').innerHTML='<p class="muted-note">No saved sessions yet.</p>'}
 if(isProgress)renderProgress();
}
function renderProgress(){
 const patientSel=$('progressPatientSelect'),exerciseSel=$('progressExerciseSelect'),placementSel=$('progressPlacementSelect');
 const current=patientSel.value;
 patientSel.innerHTML=Object.entries(people).map(([id,p])=>`<option value="${esc(id)}">${esc(id)} · ${esc(p.name)}</option>`).join('');
 patientSel.value=people[current]?current:($('patientSelect').value||Object.keys(people)[0]);
 const placement=placementSel.value||'all';
 const patientHistory=history.filter(r=>r.participantId===patientSel.value).sort((a,b)=>new Date(a.date)-new Date(b.date));
 const exerciseBase=patientHistory.filter(r=>placement==='all'||r.placement===placement);
 const prevExercise=exerciseSel.value;
 const exercises=[...new Map(exerciseBase.map(r=>[r.exerciseId,r.exerciseName])).entries()];
 exerciseSel.innerHTML='<option value="all">All exercises</option>'+exercises.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');
 exerciseSel.value=exercises.some(([id])=>id===prevExercise)?prevExercise:'all';
 const start=$('progressStartDate').value,end=$('progressEndDate').value;
 let selected=patientHistory.filter(r=>(placement==='all'||r.placement===placement)&&(exerciseSel.value==='all'||r.exerciseId===exerciseSel.value));
 if(start)selected=selected.filter(r=>new Date(r.date)>=new Date(`${start}T00:00:00`));
 if(end)selected=selected.filter(r=>new Date(r.date).getTime()<new Date(`${end}T00:00:00`).getTime()+86400000);
 const kpi=(label,value)=>`<div class="progress-kpi"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
 const latest=selected[selected.length-1];
 $('progressKpis').innerHTML=kpi('Matching sessions',selected.length)+kpi('Latest gyro RMS',latest&&latest.gyroRms!=null?`${latest.gyroRms} °/s`:'—')+kpi('Latest sample count',latest?latest.sampleCount:'—');
 $('progressFilterCount').textContent=`Showing ${selected.length} of ${patientHistory.length} sessions for ${patientSel.value}. Filters apply to the table, chart and exported progress CSV.`;
 drawProgressChart(selected);
 if(!selected.length){$('progressHistory').innerHTML='<div class="progress-empty">No saved sessions match these filters. Try a different body region, exercise or date range.</div>';return}
 $('progressHistory').innerHTML=`<table class="progress-history-table"><thead><tr><th>Date / time</th><th>Exercise</th><th>Placement</th><th>Duration</th><th>Samples</th><th>Gyro RMS (°/s)</th><th>Reps</th><th>Report</th></tr></thead><tbody>${selected.slice().reverse().map(r=>`<tr><td>${esc(new Date(r.date).toLocaleString())}</td><td>${esc(r.exerciseName)}</td><td>${esc(r.placement)}</td><td>${esc(r.duration)} s</td><td>${esc(r.sampleCount)}</td><td>${r.gyroRms==null?'—':esc(r.gyroRms)}</td><td>${r.repetitions==null?'—':esc(r.repetitions)}</td><td><button type="button" data-open-progress-report="${esc(r.id)}">Open</button></td></tr>`).join('')}</tbody></table>`;
 $('progressHistory').querySelectorAll('[data-open-progress-report]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.openProgressReport)));
}
function drawProgressChart(rows){
 const c=$('progressChart');if(!c)return;const rect=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1,w=Math.max(300,rect.width),h=250;c.width=Math.floor(w*dpr);c.height=Math.floor(h*dpr);const ctx=c.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);const pad=36;ctx.strokeStyle='#e7ebf2';ctx.fillStyle='#7b8798';ctx.font='10px sans-serif';for(let i=0;i<5;i++){const y=pad+i*(h-2*pad)/4;ctx.beginPath();ctx.moveTo(pad,y);ctx.lineTo(w-12,y);ctx.stroke()}
 const valid=rows.filter(r=>Number.isFinite(Number(r.gyroRms)));if(!valid.length){ctx.fillText('No gyroscope RMS values available for this selection.',pad+8,h/2);$('progressChartNote').textContent='Recordings will be plotted here when matching measured values are available.';return}
 const max=Math.max(...valid.map(r=>Number(r.gyroRms)),1),min=Math.min(0,...valid.map(r=>Number(r.gyroRms))),range=max-min||1;ctx.fillText(`${max.toFixed(1)} °/s`,2,pad);ctx.fillText(`${min.toFixed(1)} °/s`,2,h-pad+3);ctx.strokeStyle='#3569e8';ctx.lineWidth=2;ctx.beginPath();valid.forEach((r,i)=>{const x=pad+i*(w-pad-18)/Math.max(1,valid.length-1),y=pad+(max-Number(r.gyroRms))/range*(h-2*pad);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)});ctx.stroke();valid.forEach((r,i)=>{const x=pad+i*(w-pad-18)/Math.max(1,valid.length-1),y=pad+(max-Number(r.gyroRms))/range*(h-2*pad);ctx.fillStyle='#3569e8';ctx.beginPath();ctx.arc(x,y,3.5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#64748b';ctx.fillText(new Date(r.date).toLocaleDateString(undefined,{month:'short',day:'numeric'}),Math.max(pad,x-16),h-8)});
 $('progressChartNote').textContent=valid.length===1?'Only one matching measurement exists; record the same exercise on another date to establish a trend.':'Trend shown from saved measurements. Compare only the same exercise, placement and instructions; changes alone do not establish clinical improvement.';
}
function downloadProgress(){const pid=$('progressPatientSelect').value,ex=$('progressExerciseSelect').value,placement=$('progressPlacementSelect').value,start=$('progressStartDate').value,end=$('progressEndDate').value;let rows=history.filter(r=>r.participantId===pid&&(ex==='all'||r.exerciseId===ex)&&(placement==='all'||r.placement===placement));if(start)rows=rows.filter(r=>new Date(r.date)>=new Date(`${start}T00:00:00`));if(end)rows=rows.filter(r=>new Date(r.date)<new Date(`${end}T00:00:00`)+86400000);rows=rows.sort((a,b)=>new Date(a.date)-new Date(b.date));const out=[['participant_id','session_id','timestamp','placement','exercise_id','exercise_name','duration_seconds','sample_count','gyro_vector_rms_dps','acceleration_variability_g','detected_repetitions','estimated_peak_excursion_deg'],...rows.map(r=>[r.participantId,r.id,r.date,r.placement,r.exerciseId,r.exerciseName,r.duration,r.sampleCount,r.gyroRms,r.accelVariability,r.repetitions,r.anglePeakDeg])];download(out.map(row=>row.map(csvCell).join(',')).join('\n'),`${pid}-progress.csv`)}
function drawChart(){
 const c=$('liveChart'),ctx=c.getContext('2d'),rect=c.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
 c.width=Math.max(300,Math.floor(rect.width*dpr));c.height=190*dpr;ctx.scale(dpr,dpr);
 const w=c.width/dpr,h=c.height/dpr,p=26;ctx.clearRect(0,0,w,h);ctx.strokeStyle='#e7ebf2';
 for(let i=0;i<5;i++){let y=p+i*(h-2*p)/4;ctx.beginPath();ctx.moveTo(p,y);ctx.lineTo(w-8,y);ctx.stroke()}
 if(chartVals.length<2){ctx.fillStyle='#8c98a9';ctx.font='11px sans-serif';ctx.fillText('Waiting for real gyroscope samples…',p+8,h/2);return}
 const a=chartVals.slice(-240);let mn=Math.min(...a),mx=Math.max(...a);if(mx-mn<.1){mn-=.1;mx+=.1}
 ctx.strokeStyle='#3569e8';ctx.lineWidth=1.5;ctx.beginPath();a.forEach((v,i)=>{const x=p+i*(w-p-8-p)/Math.max(1,a.length-1),y=p+(mx-v)/(mx-mn)*(h-2*p);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
 ctx.fillStyle='#64748b';ctx.font='9px sans-serif';ctx.fillText(`${mx.toFixed(1)} °/s`,p,12);ctx.fillText(`${mn.toFixed(1)} °/s`,p,h-5);
}
$('placementSelect').addEventListener('change',updateExercises);$('exerciseSelect').addEventListener('change',showExercise);
$('patientSelect').addEventListener('change',updatePerson);$('addParticipantBtn').addEventListener('click',addPerson);
$('newParticipantName').addEventListener('keydown',e=>{if(e.key==='Enter')addPerson()});
$('connectBtn').addEventListener('click',connect);$('startBtn').addEventListener('click',start);$('stopBtn').addEventListener('click',stop);
$('downloadRawBtn').addEventListener('click',()=>{if(lastResult)downloadRaw(lastResult)});
$('viewReportsBtn').addEventListener('click',()=>{activeProfileTab='reports';showView('profile')});$('backBtn').addEventListener('click',()=>showView(profileReturnView));$('progressPatientSelect').addEventListener('change',renderProgress);$('progressPlacementSelect').addEventListener('change',renderProgress);$('progressExerciseSelect').addEventListener('change',renderProgress);$('progressStartDate').addEventListener('change',renderProgress);$('progressEndDate').addEventListener('change',renderProgress);$('clearProgressFiltersBtn').addEventListener('click',()=>{$('progressPlacementSelect').value='all';$('progressExerciseSelect').value='all';$('progressStartDate').value='';$('progressEndDate').value='';renderProgress()});$('downloadProgressBtn').addEventListener('click',downloadProgress);
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('backToPatientsBtn').addEventListener('click',()=>showView('patients'));$('profileAssessBtn').addEventListener('click',()=>showView('assessment'));$('assessmentBackBtn').addEventListener('click',()=>showView('profile'));document.querySelectorAll('[data-profile-jump]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.profileJump)?.scrollIntoView({behavior:'smooth',block:'start'})));
$('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase();
load();populatePeople();connection(false);updateExercises();updatePerson();renderRecent();renderPeople();drawChart();showView('patients');window.addEventListener('resize',()=>{drawChart();if(!$('patientProfileView').classList.contains('hidden')&&activeProfileTab==='progress')drawProfileProgress(history.filter(r=>r.participantId===$('patientSelect').value).sort((a,b)=>new Date(b.date)-new Date(a.date)))});
