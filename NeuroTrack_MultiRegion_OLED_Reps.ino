#include <Wire.h>
#include <math.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// NeuroTrack multi-region movement recording prototype.
// ESP32 + MPU6050-compatible IMU (I2C 0x69), SDA=21, SCL=22, Serial=115200.
// SSD1306 I2C OLED assumed at 0x3C (128x64). If the OLED is absent, sensor recording continues.
// Commands 1-9 correspond to dashboard exercises. Each test records 20 seconds.
// Exploratory engineering measurements only; not a diagnosis or validated clinical score.

#define OLED_WIDTH 128
#define OLED_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, -1);
bool oledReady = false;

const uint8_t MPU_ADDR = 0x69;
const uint32_t SAMPLE_US = 10000, SESSION_MS = 20000;
const float ACCEL_SCALE = 8192.0f, GYRO_SCALE = 65.5f;
const float REP_THRESHOLD_DPS = 25.0f;
const uint32_t MIN_REP_INTERVAL_MS = 300;
// Wrist-angle repetition thresholds: one rep is bend beyond 15 degrees and return below 7 degrees.
const float ANGLE_REP_START_DEG = 15.0f, ANGLE_REP_RETURN_DEG = 7.0f;
const uint32_t ANGLE_BASELINE_MS = 2000, ANGLE_MIN_REP_MS = 400;

enum Mode { NONE, WRIST_REST, WRIST_POSTURE, WRIST_FLEX_EXT, FOREARM_PRON_SUP, HEAD_STILL, HEAD_LEFT_RIGHT, HEAD_UP_DOWN, ANKLE_STILL, ANKLE_DORSI_PLANTAR };
Mode mode = NONE;
bool recording = false;
uint32_t startMs = 0, nextSampleUs = 0, lastRepMs = 0, sampleCount = 0, failedReads = 0, lastOledMs = 0;
int reps = 0, lastDirection = 0;
double sgx=0, sgy=0, sgz=0, sgx2=0, sgy2=0, sgz2=0, sax=0, say=0, saz=0, sax2=0, say2=0, saz2=0;

// Wrist flexion/extension angle tracking, based on gravity-vector change from first 2 s.
double baseAx=0, baseAy=0, baseAz=0;
uint32_t baseN=0;
bool angleBaselineReady=false, angleRepActive=false;
float currentAngleDeg=0, peakAngleDeg=0, angleRepPeakDeg=0;
uint32_t angleRepStartMs=0;

bool writeReg(uint8_t r, uint8_t v) { Wire.beginTransmission(MPU_ADDR); Wire.write(r); Wire.write(v); return Wire.endTransmission()==0; }
int readReg(uint8_t r) { Wire.beginTransmission(MPU_ADDR); Wire.write(r); if(Wire.endTransmission(false)!=0) return -1; if(Wire.requestFrom(MPU_ADDR,(uint8_t)1)!=1) return -1; return Wire.read(); }
int16_t word16(uint8_t h, uint8_t l) { return (int16_t)(((uint16_t)h<<8)|l); }

bool readSensor(float &ax,float &ay,float &az,float &gx,float &gy,float &gz) {
  Wire.beginTransmission(MPU_ADDR); Wire.write(0x3B); if(Wire.endTransmission(false)!=0) return false;
  if(Wire.requestFrom(MPU_ADDR,(uint8_t)14)!=14) return false;
  uint8_t b[14]; for(int i=0;i<14;i++) b[i]=Wire.read();
  ax=word16(b[0],b[1])/ACCEL_SCALE; ay=word16(b[2],b[3])/ACCEL_SCALE; az=word16(b[4],b[5])/ACCEL_SCALE;
  gx=word16(b[8],b[9])/GYRO_SCALE; gy=word16(b[10],b[11])/GYRO_SCALE; gz=word16(b[12],b[13])/GYRO_SCALE;
  return true;
}

const char* modeName() {
  switch(mode) {
    case WRIST_REST:return "wrist_rest"; case WRIST_POSTURE:return "wrist_postural_hold"; case WRIST_FLEX_EXT:return "wrist_flexion_extension";
    case FOREARM_PRON_SUP:return "forearm_pronation_supination"; case HEAD_STILL:return "head_still"; case HEAD_LEFT_RIGHT:return "head_horizontal_turns";
    case HEAD_UP_DOWN:return "head_vertical_tilts"; case ANKLE_STILL:return "ankle_still"; case ANKLE_DORSI_PLANTAR:return "ankle_dorsiflexion_plantarflexion"; default:return "none";
  }
}
bool repetitive() { return mode==WRIST_FLEX_EXT || mode==FOREARM_PRON_SUP || mode==HEAD_LEFT_RIGHT || mode==HEAD_UP_DOWN || mode==ANKLE_DORSI_PLANTAR; }

void resetStats() {
  sampleCount=failedReads=reps=lastRepMs=0; lastDirection=0;
  sgx=sgy=sgz=sgx2=sgy2=sgz2=sax=say=saz=sax2=say2=saz2=0;
  baseAx=baseAy=baseAz=0; baseN=0; angleBaselineReady=false; angleRepActive=false;
  currentAngleDeg=peakAngleDeg=angleRepPeakDeg=0; angleRepStartMs=0;
}
double nn(double x) { return x>0?x:0; }
double vectorRms(double x,double x2,double y,double y2,double z,double z2,double n) {
  return sqrt(nn(x2/n-pow(x/n,2))+nn(y2/n-pow(y/n,2))+nn(z2/n-pow(z/n,2)));
}

void oledMessage(const char* title, const char* line1, const char* line2) {
  if(!oledReady) return;
  display.clearDisplay(); display.setTextColor(SSD1306_WHITE); display.setTextSize(1); display.setCursor(0,0);
  display.println(title); display.println(); display.println(line1); display.println(line2); display.display();
}
void updateOled(uint32_t elapsed) {
  if(!oledReady || millis()-lastOledMs<1000) return;
  lastOledMs=millis(); display.clearDisplay(); display.setTextColor(SSD1306_WHITE); display.setTextSize(1); display.setCursor(0,0);
  if(recording) {
    display.println("NeuroTrack | RECORD");
    display.print(modeName()); display.println();
    display.print("Time: "); display.print(elapsed/1000.0f,1); display.println(" / 20 s");
    if(mode==WRIST_FLEX_EXT) { display.print("Angle: "); display.print(currentAngleDeg,1); display.println(" deg"); display.print("Peak:  "); display.print(peakAngleDeg,1); display.println(" deg"); }
    else { display.println("Motion recording"); }
    display.print("Reps: "); display.println(reps);
    display.print("Samples: "); display.println(sampleCount);
  } else {
    display.println("NeuroTrack ready"); display.println("ESP32 + MPU6050"); display.println("USB: 115200 baud"); display.println("Dashboard commands"); display.println("1-9 start 20s test");
  }
  display.display();
}
void menu() {
  Serial.println(); Serial.println("# NeuroTrack 20-second tests; send digit 1-9");
  Serial.println("#1 wrist rest, #2 wrist posture, #3 wrist flex/extend, #4 forearm pronation/supination");
  Serial.println("#5 head still, #6 head left/right, #7 head up/down, #8 ankle still, #9 ankle up/down");
}
void beginMode(Mode m) {
  mode=m; recording=true; startMs=millis(); nextSampleUs=micros(); resetStats();
  Serial.printf("#BEGIN,exercise=%s,duration_s=20,target_hz=100\n",modeName());
  Serial.println("#DATA,time_ms,exercise,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,rep_count");
  oledMessage("NeuroTrack | RECORD", modeName(), "Keep sensor secure");
}
void result() {
  Serial.println("#SUMMARY"); Serial.printf("#RESULT,exercise=%s\n",modeName()); Serial.printf("#RESULT,duration_ms=%lu\n",(unsigned long)(millis()-startMs));
  Serial.printf("#RESULT,samples=%lu\n",(unsigned long)sampleCount); Serial.printf("#RESULT,failed_reads=%lu\n",(unsigned long)failedReads);
  if(sampleCount<10) { Serial.println("#RESULT,metrics=UNAVAILABLE,reason=too_few_samples"); return; }
  double n=sampleCount, gr=vectorRms(sgx,sgx2,sgy,sgy2,sgz,sgz2,n), ar=vectorRms(sax,sax2,say,say2,saz,saz2,n);
  Serial.printf("#RESULT,gyro_centered_rms_dps=%.3f\n",gr); Serial.printf("#RESULT,accel_dynamic_rms_g=%.4f\n",ar);
  Serial.printf("#RESULT,detected_repetitions=%d\n",reps);
  if(mode==WRIST_FLEX_EXT) Serial.printf("#RESULT,estimated_peak_excursion_deg=%.1f\n",peakAngleDeg);
  Serial.println("#NOTE,Exploratory movement measurements only; not a diagnosis or validated clinical score.");
}
void finish() {
  recording=false; result(); Serial.printf("#END,exercise=%s\n",modeName()); mode=NONE;
  oledMessage("NeuroTrack done", "20-second test saved", "See laptop report"); menu();
}
void command(char c) {
  if(recording) return;
  switch(c) { case '1':beginMode(WRIST_REST);break; case '2':beginMode(WRIST_POSTURE);break; case '3':beginMode(WRIST_FLEX_EXT);break;
    case '4':beginMode(FOREARM_PRON_SUP);break; case '5':beginMode(HEAD_STILL);break; case '6':beginMode(HEAD_LEFT_RIGHT);break;
    case '7':beginMode(HEAD_UP_DOWN);break; case '8':beginMode(ANKLE_STILL);break; case '9':beginMode(ANKLE_DORSI_PLANTAR);break; }
}

void setup() {
  Serial.begin(115200); Wire.begin(21,22); Wire.setClock(400000); delay(200);
  if(display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) { oledReady=true; oledMessage("NeuroTrack ready", "ESP32 + MPU6050", "Waiting for test"); }
  else Serial.println("#WARN,SSD1306 OLED not found at 0x3C; recording will continue without display.");
  int who=readReg(0x75);
  if(who<0) { Serial.println("#ERROR,MPU not found at 0x69. Check SDA=21 SCL=22 power and GND."); oledMessage("Sensor error", "MPU6050 not found", "Check I2C wiring"); while(true) delay(1000); }
  Serial.printf("#WHO_AM_I,0x%02X\n",who);
  if(!writeReg(0x6B,1)||!writeReg(0x1A,3)||!writeReg(0x1B,8)||!writeReg(0x1C,8)) { Serial.println("#ERROR,MPU config failed"); oledMessage("Sensor error", "MPU config failed", "Check wiring"); while(true) delay(1000); }
  delay(100); menu();
}

void loop() {
  while(Serial.available()) command((char)Serial.read());
  if(!recording) return;
  uint32_t now=micros(); if((int32_t)(now-nextSampleUs)<0) return; nextSampleUs+=SAMPLE_US;
  float ax,ay,az,gx,gy,gz;
  if(!readSensor(ax,ay,az,gx,gy,gz)) { failedReads++; return; }
  uint32_t elapsed=millis()-startMs; sampleCount++;
  sgx+=gx; sgy+=gy; sgz+=gz; sgx2+=gx*gx; sgy2+=gy*gy; sgz2+=gz*gz;
  sax+=ax; say+=ay; saz+=az; sax2+=ax*ax; say2+=ay*ay; saz2+=az*az;

  if(mode==WRIST_FLEX_EXT) {
    if(elapsed<=ANGLE_BASELINE_MS) { baseAx+=ax; baseAy+=ay; baseAz+=az; baseN++; }
    else if(baseN>0) {
      angleBaselineReady=true;
      float bx=baseAx/baseN, by=baseAy/baseN, bz=baseAz/baseN;
      float bm=sqrtf(bx*bx+by*by+bz*bz), sm=sqrtf(ax*ax+ay*ay+az*az);
      if(bm>0.01f && sm>0.01f) {
        float dot=(bx*ax+by*ay+bz*az)/(bm*sm); dot=fmaxf(-1.0f,fminf(1.0f,dot));
        currentAngleDeg=acosf(dot)*180.0f/PI; if(currentAngleDeg>peakAngleDeg) peakAngleDeg=currentAngleDeg;
        // One wrist repetition = excursion above threshold, then return near baseline.
        if(!angleRepActive && currentAngleDeg>=ANGLE_REP_START_DEG) { angleRepActive=true; angleRepStartMs=elapsed; angleRepPeakDeg=currentAngleDeg; }
        if(angleRepActive) {
          if(currentAngleDeg>angleRepPeakDeg) angleRepPeakDeg=currentAngleDeg;
          if(currentAngleDeg<=ANGLE_REP_RETURN_DEG) {
            if(angleRepPeakDeg>=ANGLE_REP_START_DEG && elapsed-angleRepStartMs>=ANGLE_MIN_REP_MS && elapsed-lastRepMs>=MIN_REP_INTERVAL_MS) { reps++; lastRepMs=elapsed; }
            angleRepActive=false; angleRepPeakDeg=0;
          }
        }
      }
    }
  } else if(repetitive()) {
    // Provisional gyro-Y direction counter for other mounted exercises; validate axis per placement.
    int d=gy>REP_THRESHOLD_DPS?1:(gy< -REP_THRESHOLD_DPS?-1:0);
    if(d && d!=lastDirection) { if(d==1 && lastDirection==-1 && elapsed-lastRepMs>=MIN_REP_INTERVAL_MS) { reps++; lastRepMs=elapsed; } lastDirection=d; }
  }

  Serial.printf("%lu,%s,%.4f,%.4f,%.4f,%.3f,%.3f,%.3f,%d\n",(unsigned long)elapsed,modeName(),ax,ay,az,gx,gy,gz,reps);
  updateOled(elapsed);
  if(elapsed>=SESSION_MS) finish();
}
