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
const VALIDATION_KEY='neurotrack_validation_v1';
let validationRecords=[];
let people={...defaultPeople},history=[],port=null,reader=null,writer=null;
let running=false,startedAt=0,timer=null,exercise=null,samples=[],chartVals=[],summary={},lastResult=null,buffer='';
let angleBaseline=null,anglePeakDeg=0,angleTrace=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function load(){
 try{const s=JSON.parse(localStorage.getItem(KEY)||'{}');if(s.people)people={...defaultPeople,...s.people};if(Array.isArray(s.history))history=s.history.map(r=>({...r,date:new Date(r.date),samples:[]}));syncPeopleCounts();lastResult=history[0]||null;}catch(e){console.warn(e)}
 try{const v=JSON.parse(localStorage.getItem(VALIDATION_KEY)||'[]');if(Array.isArray(v))validationRecords=v;}catch(e){console.warn(e)}
}
function save(){
 // Keep full raw arrays in memory for export; persist summaries only to avoid filling browser storage.
 const compact=history.slice(0,500).map(r=>({...r,samples:undefined,angleTrace:undefined}));
 try{localStorage.setItem(KEY,JSON.stringify({people,history:compact}));}catch(e){setMsg('Local storage is full. Download the CSV files for safekeeping.',true)}
}
function syncPeopleCounts(){
 Object.entries(people).forEach(([id,p])=>{const rows=history.filter(r=>r.participantId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));p.sessions=rows.length;p.last=rows.length?new Date(rows[0].date).toLocaleDateString():'No sessions yet';});
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
 $('newParticipantName').value='';populatePeople();$('patientSelect').value=id;save();updatePerson();
}
function updatePerson(){
 const id=$('patientSelect').value,p=people[id];if(!p)return;
 $('patientName').textContent=p.name;$('patientMeta').textContent=`${id} · Local pilot profile`;
 $('patientAvatar').textContent=p.initials||p.name.slice(0,2).toUpperCase();$('patientSessions').textContent=p.sessions||0;
 $('lastSession').textContent=p.last||'No sessions yet';$('profileFoot').textContent='Local participant profile';renderPeople();renderProfileHistory();
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
function assessSignalQuality(rows, durationSeconds){
 const expected=Math.max(1,Math.round(20*100));
 const count=rows.length;
 const completeness=Math.min(100,count/expected*100);
 const numericBad=rows.filter(s=>![s.timeMs,s.ax,s.ay,s.az,s.gx,s.gy,s.gz,s.reps].every(Number.isFinite)).length;
 // Conservative clipping flags for common MPU6050 full-scale limits; sensor units must match firmware.
 const clipped=rows.filter(s=>Math.abs(s.ax)>=15.8||Math.abs(s.ay)>=15.8||Math.abs(s.az)>=15.8||Math.abs(s.gx)>=1990||Math.abs(s.gy)>=1990||Math.abs(s.gz)>=1990).length;
 const reasons=[];
 if(count<1600)reasons.push(`Low sample count (${count}; expected about ${expected} for 20 s at 100 Hz).`);
 else if(completeness<95)reasons.push(`Sample completeness is ${completeness.toFixed(1)}%.`);
 if(numericBad)reasons.push(`${numericBad} samples contain non-numeric values.`);
 if(clipped)reasons.push(`${clipped} samples approach common MPU6050 full-scale limits; confirm sensor range and units.`);
 if(durationSeconds<18)reasons.push(`Recorded sample span is only ${durationSeconds.toFixed(1)} s.`);
 let status='Good recording';
 if(!count||completeness<80||numericBad>0)status='Invalid / incomplete';
 else if(completeness<95||clipped>0||durationSeconds<18)status='Review recording';
 return {status,expectedSamples:expected,sampleCount:count,completenessPct:+completeness.toFixed(1),numericBad,clipped,durationSeconds:+durationSeconds.toFixed(2),reasons};
}
function saveValidationRecords(){try{localStorage.setItem(VALIDATION_KEY,JSON.stringify(validationRecords.slice(-500)))}catch(e){$('backupStatus').textContent='Browser storage is full; export your JSON backup.'}}
function validationStats(){
 const paired=validationRecords.filter(r=>Number.isFinite(r.deviceAngle)&&Number.isFinite(r.referenceAngle));
 if(!paired.length)return null;
 const errors=paired.map(r=>r.deviceAngle-r.referenceAngle),abs=errors.map(Math.abs),bias=errors.reduce((a,b)=>a+b,0)/errors.length;
 const sd=errors.length>1?Math.sqrt(errors.reduce((a,b)=>a+(b-bias)**2,0)/(errors.length-1)):null;
 const referenceMean=paired.reduce((a,r)=>a+r.referenceAngle,0)/paired.length;
 const referenceSd=paired.length>1?Math.sqrt(paired.reduce((a,r)=>a+(r.referenceAngle-referenceMean)**2,0)/(paired.length-1)):null;
 const cv=referenceMean!==0&&referenceSd!=null?referenceSd/Math.abs(referenceMean)*100:null;
 return {n:paired.length,mae:abs.reduce((a,b)=>a+b,0)/abs.length,bias,sd,loaLow:sd==null?null:bias-1.96*sd,loaHigh:sd==null?null:bias+1.96*sd,referenceCv:cv};
}
function renderValidation(){
 const s=validationStats(),kpi=(label,value)=>`<div class="progress-kpi"><span>${esc(label)}</span><strong>${value==null?'—':esc(value)}</strong></div>`;
 $('validationMetrics').innerHTML=s?kpi('Paired trials',s.n)+kpi('Mean absolute error',`${s.mae.toFixed(2)}°`)+kpi('Mean bias',`${s.bias>=0?'+':''}${s.bias.toFixed(2)}°`)+kpi('95% agreement limits',s.sd==null?'Need ≥2':`${s.loaLow.toFixed(2)}° to ${s.loaHigh.toFixed(2)}°`):kpi('Paired trials','0')+kpi('Mean absolute error','—')+kpi('Mean bias','—')+kpi('95% agreement limits','—');
 const table=$('validationTable');
 if(!validationRecords.length){table.innerHTML='<p class="muted-note">No paired measurements saved yet.</p>';return}
 table.innerHTML=`<table class="report-table"><thead><tr><th>Trial</th><th>Device</th><th>Reference</th><th>Error</th><th>Saved</th><th></th></tr></thead><tbody>${validationRecords.slice().reverse().map(r=>`<tr><td>${esc(r.participant||'—')} · ${esc(r.trial||'—')}</td><td>${r.deviceAngle.toFixed(1)}°</td><td>${r.referenceAngle.toFixed(1)}°</td><td>${(r.deviceAngle-r.referenceAngle)>=0?'+':''}${(r.deviceAngle-r.referenceAngle).toFixed(1)}°</td><td>${esc(new Date(r.createdAt).toLocaleDateString())}</td><td><button type="button" data-delete-validation="${esc(r.id)}">Delete</button></td></tr>`).join('')}</tbody></table><p class="muted-note">Positive error means NeuroTrack estimated a larger angle than the reference. Agreement limits are only a preliminary estimate and require sufficient independent paired observations; repeated measures from the same person are not fully independent.</p>`;
 table.querySelectorAll('[data-delete-validation]').forEach(b=>b.addEventListener('click',()=>{if(confirm('Delete this paired measurement?')){validationRecords=validationRecords.filter(r=>r.id!==b.dataset.deleteValidation);saveValidationRecords();renderValidation()}}));
}
function saveValidation(){
 const participant=$('validationParticipant').value.trim(),trial=$('validationTrial').value.trim(),deviceAngle=Number($('validationDeviceAngle').value),referenceAngle=Number($('validationReferenceAngle').value);
 if(!Number.isFinite(deviceAngle)||!Number.isFinite(referenceAngle)||$('validationDeviceAngle').value===''||$('validationReferenceAngle').value===''||deviceAngle<0||deviceAngle>180||referenceAngle<0||referenceAngle>180){alert('Enter both angles as numbers from 0° to 180°.');return}
 validationRecords.push({id:`VAL-${Date.now()}`,participant,trial,deviceAngle,referenceAngle,notes:$('validationNotes').value.trim(),createdAt:new Date().toISOString(),method:'manual_paired_measurement'});saveValidationRecords();$('validationDeviceAngle').value='';$('validationReferenceAngle').value='';$('validationNotes').value='';renderValidation();
}
function exportValidation(){const rows=[['id','participant_or_group','trial','device_angle_deg','reference_angle_deg','error_device_minus_reference_deg','notes','created_at'],...validationRecords.map(r=>[r.id,r.participant,r.trial,r.deviceAngle,r.referenceAngle,r.deviceAngle-r.referenceAngle,r.notes,r.createdAt])];download(rows.map(row=>row.map(csvCell).join(',')).join('\n'),'neurotrack-validation-paired-measurements.csv')}
function exportBackup(){
 const payload={app:'NeuroTrack',backupVersion:1,exportedAt:new Date().toISOString(),notice:'Local pilot data backup. Raw sensor samples are not included unless separately exported as per-session CSV files.',people,history:history.slice(0,500).map(r=>({...r,samples:undefined,angleTrace:undefined,date:r.date instanceof Date?r.date.toISOString():r.date})),validationRecords};
 download(JSON.stringify(payload,null,2),`neurotrack-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json');$('backupStatus').textContent='Backup exported. Store it somewhere safe; also save raw-sample CSVs separately if needed.';
}
async function importBackup(file){
 if(!file)return;
 try{const data=JSON.parse(await file.text());if(data.app!=='NeuroTrack'||!data.people||!Array.isArray(data.history)||!Array.isArray(data.validationRecords))throw new Error('This does not look like a NeuroTrack backup.');
   if(!confirm('Import this backup and merge its profiles, session summaries and validation entries with this browser? Existing records with the same IDs will be replaced.'))return;
   people={...people,...data.people};const merged=new Map(history.map(r=>[r.id,r]));data.history.forEach(r=>merged.set(r.id,{...r,date:new Date(r.date),samples:[]}));history=[...merged.values()].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,500);
   const vals=new Map(validationRecords.map(r=>[r.id,r]));data.validationRecords.forEach(r=>vals.set(r.id,r));validationRecords=[...vals.values()].slice(-500);
   save();saveValidationRecords();populatePeople();updatePerson();renderPeople();renderRecent();renderProgress();renderValidation();if(history[0]){lastResult=history[0];renderReport(lastResult)}$('backupStatus').textContent=`Imported ${data.history.length} session summaries and ${data.validationRecords.length} validation entries. Raw sample arrays are not restored from this backup.`;
 }catch(e){alert(`Could not import backup: ${e.message||e}`)}finally{$('importBackupInput').value=''}
}
function finish(){
 if(!running)return;running=false;if(timer)clearInterval(timer);timer=null;
 const date=new Date(),pid=$('patientSelect').value,secs=samples.length>1?(samples.at(-1).timeMs-samples[0].timeMs)/1000:0;
 const result={id:`NT-${date.getTime()}`,participantId:pid,participantName:people[pid]?.name||pid,placement:$('placementSelect').value,
 exerciseId:exercise.id,exerciseName:exercise.name,duration:Number(secs.toFixed(2)),date:date.toISOString(),sampleCount:samples.length,
 samples:samples.slice(),gyroRms:vectorRms(samples,['gx','gy','gz']),accelVariability:vectorRms(samples,['ax','ay','az']),repetitions:samples.length?samples.at(-1).reps:null,
 anglePeakDeg:exercise.id==='wrist_flex_ext'&&angleTrace.length?+anglePeakDeg.toFixed(1):null,
 angleTrace:angleTrace.slice(),angleMethod:exercise.id==='wrist_flex_ext'?'accelerometer gravity-vector angle from first 2-second baseline':'not_applicable',
 dataSource:'ESP32_MPU6050_REAL',deviceSummary:{...summary},signalQuality:null};
 result.signalQuality=assessSignalQuality(samples,result.duration);
 if(result.gyroRms!=null)result.gyroRms=+result.gyroRms.toFixed(3);if(result.accelVariability!=null)result.accelVariability=+result.accelVariability.toFixed(4);
 lastResult=result;history.unshift(result);syncPeopleCounts();
 save();$('startBtn').disabled=!port;$('stopBtn').disabled=true;$('downloadRawBtn').disabled=!samples.length;
 $('sessionStatus').textContent='● COMPLETED';$('sessionStatus').className='live-pill done';
 setMsg(samples.length?`Completed: captured ${samples.length} real sensor samples.`:'No valid samples received. Check the port, wiring and firmware.',!samples.length);
 $('progressCaption').textContent='Session finished';$('liveReps').textContent=result.repetitions??'—';
 $('liveQuality').textContent=result.signalQuality.status;$('liveSamples').textContent=samples.length;renderQualityLatest(result);
 $('todayCount').textContent=Number($('todayCount').textContent||0)+1;updatePerson();renderRecent();renderReport(result);renderPeople();
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
function renderQualityLatest(r){
 const q=r?.signalQuality,el=$('qualityLatest');if(!el)return;if(!q){el.innerHTML='<strong>No completed session checked yet</strong><p>Complete a recording to see its signal quality assessment in the report.</p>';return}
 const cls=q.status==='Good recording'?'quality-good':q.status==='Review recording'?'quality-review':'quality-invalid';
 el.innerHTML=`<span class="quality-badge ${cls}">${esc(q.status)}</span><strong>${q.completenessPct}% sample completeness</strong><p>${q.sampleCount} samples received · expected about ${q.expectedSamples} · sample span ${q.durationSeconds}s</p>${q.reasons.length?`<ul>${q.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<p>No configured technical warning was triggered. This is not clinical validation.</p>'}`;
}
function renderReport(r){
 if(!r)return;const list=$('reportHistoryList');if(list){list.innerHTML=`<h4>All saved sessions (${history.length})</h4>`+history.map(item=>`<div class="report-history-row ${item.id===r.id?'selected':''}"><button type="button" class="report-history-item ${item.id===r.id?'selected':''}" data-report-id="${esc(item.id)}"><span><strong>${esc(item.exerciseName)}</strong><small>${esc(item.participantId)} · ${new Date(item.date).toLocaleString()} · ${esc(item.placement)}</small></span><b>${item.sampleCount||0} samples</b></button><button type="button" class="history-delete-btn" data-delete-session="${esc(item.id)}" aria-label="Delete session">Delete</button></div>`).join('');list.querySelectorAll('[data-report-id]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.reportId)));list.querySelectorAll('[data-delete-session]').forEach(b=>b.addEventListener('click',()=>deleteSession(b.dataset.deleteSession)));}const stat=(label,val,unit='')=>`<div class="report-stat"><span>${esc(label)}</span><strong>${val==null?'—':esc(val)+esc(unit)}</strong></div>`;
 const rows=[['Raw samples captured',r.sampleCount,'Samples received by browser'],['Gyroscope vector RMS',r.gyroRms==null?null:r.gyroRms+' °/s','Variation of three-axis angular velocity'],['Acceleration variability',r.accelVariability==null?null:r.accelVariability+' g','Variation of three-axis acceleration'],['Detected repetitions',r.repetitions,'Firmware estimate; requires calibration']];
 if(r.signalQuality)rows.unshift(['Signal quality gate',r.signalQuality.status,`${r.signalQuality.completenessPct}% of expected samples; ${r.signalQuality.reasons.join(' ')||'No configured technical warning triggered.'}`]);
 if(r.exerciseId==='wrist_flex_ext')rows.push(['Estimated peak angular excursion',r.anglePeakDeg==null?null:r.anglePeakDeg+'°','Accelerometer gravity-vector change relative to the first 2 seconds; approximate only']);
 $('reportContent').innerHTML=`<div class="notice"><span class="notice-icon">ⓘ</span><div><strong>Engineering pilot result</strong><p>Values are calculated from actual serial samples. They are not validated clinical measurements and cannot diagnose a condition.</p></div></div><div class="report-summary">${stat('Participant',r.participantId)}${stat('Body region',r.placement)}${stat('Raw samples',r.sampleCount)}</div><h4>${esc(r.exerciseName)}</h4><p class="muted-note">Recorded ${new Date(r.date).toLocaleString()} · ${r.duration}s · ESP32 + MPU6050</p><table class="report-table"><thead><tr><th>Metric</th><th>Measured result</th><th>Meaning</th></tr></thead><tbody>${rows.map(([n,v,m])=>`<tr><td>${esc(n)}</td><td>${v==null?'—':esc(v)}</td><td>${esc(m)}</td></tr>`).join('')}</tbody></table><p class="muted-note">Compare only recordings with the same placement, task and instructions. Changes do not by themselves prove recovery or disease severity. Angle is a preliminary gravity-vector estimate and can be inaccurate during fast movement, sensor slippage, or non-standard mounting; validate against a known angle before relying on it.</p><div class="device-buttons"><button class="secondary-button" id="downloadSummaryBtn">Download summary CSV</button><button class="secondary-button" id="deleteReportSessionBtn">Delete this session</button><button class="secondary-button" id="downloadReportRawBtn" ${r.samples&&r.samples.length?'':'disabled title="Raw samples were not retained after reload"'}>${r.samples&&r.samples.length?'Download raw samples CSV':'Raw samples unavailable after reload'}</button></div>`;
 $('downloadSummaryBtn').addEventListener('click',()=>downloadSummary(r));$('deleteReportSessionBtn').addEventListener('click',()=>deleteSession(r.id));if(r.samples&&r.samples.length)$('downloadReportRawBtn').addEventListener('click',()=>downloadRaw(r));
}
function localDayKey(value){const d=new Date(value);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function renderProfileHistory(){
 const host=$('profileHistoryList');if(!host)return;const pid=$('patientSelect')?.value;
 const rows=history.filter(r=>r.participantId===pid).sort((a,b)=>new Date(b.date)-new Date(a.date));
 if(!rows.length){host.innerHTML='<div class="progress-empty">No saved sessions for this profile yet. Complete a real recording and its summary will appear here.</div>';return}
 const groups=new Map();rows.forEach(r=>{const key=localDayKey(r.date);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});
 host.innerHTML=[...groups.entries()].map(([key,items])=>{
   const dayLabel=new Date(`${key}T12:00:00`).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'});
   return `<section class="profile-day-group"><div class="profile-day-heading"><h4>${esc(dayLabel)}</h4><span>${items.length} session${items.length===1?'':'s'}</span></div><div class="profile-day-sessions">${items.map(r=>`<article class="profile-session-card"><div class="profile-session-main"><strong>${esc(r.exerciseName)}</strong><span>${esc(r.placement)} · ${new Date(r.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} · ${esc(r.duration)} s</span><div class="profile-session-metrics"><span>Samples <b>${esc(r.sampleCount??'—')}</b></span><span>Gyro RMS <b>${r.gyroRms==null?'—':esc(r.gyroRms)+' °/s'}</b></span><span>Reps <b>${r.repetitions==null?'—':esc(r.repetitions)}</b></span>${r.anglePeakDeg!=null?`<span>Angle span <b>${esc(r.anglePeakDeg)}°</b></span>`:''}</div><small>${r.signalQuality?`Signal check: ${esc(r.signalQuality.status)}`:'Engineering recording summary'}</small></div><div class="profile-session-actions"><button type="button" class="secondary-button" data-open-profile-session="${esc(r.id)}">View report</button><button type="button" class="history-delete-btn" data-delete-session="${esc(r.id)}">Delete</button></div></article>`).join('')}</div></section>`;
 }).join('');
 host.querySelectorAll('[data-open-profile-session]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.openProfileSession)));
 host.querySelectorAll('[data-delete-session]').forEach(b=>b.addEventListener('click',()=>deleteSession(b.dataset.deleteSession)));
}
function deleteSession(id){
 const r=history.find(item=>item.id===id);if(!r)return;
 if(!confirm(`Delete the saved session for ${r.participantId} — ${r.exerciseName} on ${new Date(r.date).toLocaleString()}? This removes its saved summary from this browser. Previously downloaded CSV files are not deleted.`))return;
 history=history.filter(item=>item.id!==id);if(lastResult?.id===id)lastResult=history[0]||null;syncPeopleCounts();save();
 updatePerson();renderRecent();renderPeople();renderProfileHistory();renderProgress();
 if(!$('reportView').classList.contains('hidden')){if(lastResult)renderReport(lastResult);else{$('reportHistoryList').innerHTML='<p class="muted-note">No saved sessions yet.</p>';$('reportContent').innerHTML='<div class="progress-empty">No saved session selected.</div>'}}
 setMsg('Saved session summary deleted. Exported CSV backups, if any, remain on your computer.');
}
function openReport(id){const r=history.find(item=>item.id===id);if(!r)return;lastResult=r;showView('reports');renderReport(r)}
function renderPeople(){
 $('patientDirectory').innerHTML=Object.entries(people).map(([id,p])=>`<div class="directory-card"><div class="patient-avatar">${esc(p.initials||p.name.slice(0,2))}</div><h4>${esc(p.name)}</h4><p>${esc(id)} · Local pilot profile</p><p>${p.sessions||0} saved sessions · Last: ${esc(p.last||'None')}</p><button class="secondary-button" data-person="${esc(id)}">Select profile</button></div>`).join('');
 $('patientDirectory').querySelectorAll('[data-person]').forEach(b=>b.addEventListener('click',()=>{$('patientSelect').value=b.dataset.person;updatePerson();showView('assessment')}));
}
function showView(v){
 $('assessmentView').classList.toggle('hidden',v!=='assessment');$('reportView').classList.toggle('hidden',v!=='reports');$('patientsView').classList.toggle('hidden',v!=='patients');$('progressView').classList.toggle('hidden',v!=='progress');$('validationView').classList.toggle('hidden',v!=='validation');
 $('pageTitle').textContent=v==='patients'?'Participant profiles':v==='reports'?'Session reports':v==='progress'?'Patient progress':v==='validation'?'Validation & reliability lab':'Assessment workspace';
 document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(v==='reports'){if(lastResult)renderReport(lastResult);else $('reportHistoryList').innerHTML='<p class="muted-note">No saved sessions yet.</p>'}if(v==='progress')renderProgress();if(v==='validation'){renderValidation();renderQualityLatest(lastResult)}
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
 $('progressHistory').innerHTML=`<table class="progress-history-table"><thead><tr><th>Date / time</th><th>Exercise</th><th>Placement</th><th>Duration</th><th>Samples</th><th>Gyro RMS (°/s)</th><th>Reps</th><th>Report</th><th>Delete</th></tr></thead><tbody>${selected.slice().reverse().map(r=>`<tr><td>${esc(new Date(r.date).toLocaleString())}</td><td>${esc(r.exerciseName)}</td><td>${esc(r.placement)}</td><td>${esc(r.duration)} s</td><td>${esc(r.sampleCount)}</td><td>${r.gyroRms==null?'—':esc(r.gyroRms)}</td><td>${r.repetitions==null?'—':esc(r.repetitions)}</td><td><button type="button" data-open-progress-report="${esc(r.id)}">Open</button></td><td><button type="button" data-delete-session="${esc(r.id)}">Delete</button></td></tr>`).join('')}</tbody></table>`;
 $('progressHistory').querySelectorAll('[data-open-progress-report]').forEach(b=>b.addEventListener('click',()=>openReport(b.dataset.openProgressReport)));$('progressHistory').querySelectorAll('[data-delete-session]').forEach(b=>b.addEventListener('click',()=>deleteSession(b.dataset.deleteSession)));
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
$('viewReportsBtn').addEventListener('click',()=>showView('reports'));$('backBtn').addEventListener('click',()=>showView('assessment'));$('progressPatientSelect').addEventListener('change',renderProgress);$('progressPlacementSelect').addEventListener('change',renderProgress);$('progressExerciseSelect').addEventListener('change',renderProgress);$('progressStartDate').addEventListener('change',renderProgress);$('progressEndDate').addEventListener('change',renderProgress);$('clearProgressFiltersBtn').addEventListener('click',()=>{$('progressPlacementSelect').value='all';$('progressExerciseSelect').value='all';$('progressStartDate').value='';$('progressEndDate').value='';renderProgress()});$('downloadProgressBtn').addEventListener('click',downloadProgress);$('openProfileProgressBtn').addEventListener('click',()=>{ $('progressPatientSelect').value=$('patientSelect').value;showView('progress') });
document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
$('saveValidationBtn').addEventListener('click',saveValidation);$('exportValidationBtn').addEventListener('click',exportValidation);$('exportBackupBtn').addEventListener('click',exportBackup);$('importBackupInput').addEventListener('change',e=>importBackup(e.target.files?.[0]));
$('todayLabel').textContent=new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}).toUpperCase();
load();populatePeople();connection(false);updateExercises();updatePerson();renderProfileHistory();renderRecent();renderPeople();drawChart();renderValidation();renderQualityLatest(lastResult);window.addEventListener('resize',drawChart);
