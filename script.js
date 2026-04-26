/* ============================================================
   SMART CAR WEBSITE — script.js
   ============================================================ */

/* ---- NAV active link on scroll ---- */
const sections = document.querySelectorAll('section');
const navLinks = document.querySelectorAll('.nav-links a');

const observer = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navLinks.forEach(a => {
        a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id);
      });
    }
  });
}, { threshold: 0.4 });
sections.forEach(s => observer.observe(s));

/* ---- Scroll reveal ---- */
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => revealObs.observe(el));

/* ============================================================
   PAGE 5 — ARDUINO CODE DISPLAY
   ============================================================ */
const arduinoCode = `
#include <SoftwareSerial.h>

SoftwareSerial BT_Serial(2, 3); // RX, TX

// ─── Motor Driver Pins ───────────────────────────────────────────────────────
#define enA 10
#define in1 9
#define in2 8
#define in3 7
#define in4 6
#define enB 5

// ─── Sensor & Servo Pins ────────────────────────────────────────────────────
#define servo    A4
#define R_S      A0    // Right IR sensor
#define L_S      A1   // Left  IR sensor
#define echo     A2
#define trigger  A3

// ─── Variables ───────────────────────────────────────────────────────────────
int  distance_L, distance_R;
long distance_F = 50;

int  bt_data    = 0;
int  Speed      = 130;
int  mode       = 0;    // 0=Manual/Voice  1=Line Follow  2=Obstacle Avoid

const int OBSTACLE_THRESHOLD = 50;  // cm — stop if object closer than this
const int SERVO_CENTER = 100;        // degrees — servo center (facing forward)
const int SERVO_LEFT   = 180;       // degrees — servo left
const int SERVO_RIGHT  = 0;         // degrees — servo right

// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  pinMode(R_S,     INPUT);
  pinMode(L_S,     INPUT);
  pinMode(echo,    INPUT);
  pinMode(trigger, OUTPUT);
  pinMode(enA,     OUTPUT);
  pinMode(in1,     OUTPUT);
  pinMode(in2,     OUTPUT);
  pinMode(in3,     OUTPUT);
  pinMode(in4,     OUTPUT);
  pinMode(enB,     OUTPUT);
  pinMode(servo,   OUTPUT);

  Serial.begin(9600);
  BT_Serial.begin(9600);

  // Servo startup sweep
  for (int a = SERVO_CENTER; a <= SERVO_LEFT;   a += 5) servoPulse(servo, a);
  for (int a = SERVO_LEFT;   a >= SERVO_RIGHT;  a -= 5) servoPulse(servo, a);
  for (int a = SERVO_RIGHT;  a <= SERVO_CENTER; a += 5) servoPulse(servo, a);
  delay(500);
}

// ─────────────────────────────────────────────────────────────────────────────
void loop() {

  // ── Read Bluetooth ──────────────────────────────────────────────────────
  if (BT_Serial.available() > 0) {
    bt_data = BT_Serial.read();
    Serial.print("BT Data: ");
    Serial.println(bt_data);

    if (bt_data > 10 && bt_data <= 255) {
      Speed = bt_data;
    }

    // ── Mode Select ────────────────────────────────────────────────────
    if      (bt_data == 8)  { mode = 0; Speed = 130; Stop(); }
    else if (bt_data == 9)  { mode = 1; Speed = 100; }
    else if (bt_data == 10) { mode = 2; Speed = 150; }
  }

  analogWrite(enA, Speed);
  analogWrite(enB, Speed);

  // ── Manual / Voice Mode ─────────────────────────────────────────────────
  if (mode == 0) {
    if      (bt_data == 1) forword();
    else if (bt_data == 2) backword();
    else if (bt_data == 3) turnLeft();
    else if (bt_data == 4) turnRight();
    else if (bt_data == 5) Stop();
    else if (bt_data == 6) { turnLeft();  delay(400); Stop(); bt_data = 0; }
    else if (bt_data == 7) { turnRight(); delay(400); Stop(); bt_data = 0; }
  }

  // ── Line Following Mode ─────────────────────────────────────────────────
  // (UNCHANGED)
  if (mode == 1) {
    bool rightOnLine = (digitalRead(R_S) == LOW);
    bool leftOnLine  = (digitalRead(L_S) == LOW);

    Serial.print("IR L="); Serial.print(leftOnLine);
    Serial.print(" R=");    Serial.println(rightOnLine);

    if       ( leftOnLine &&  rightOnLine) forword();
    else if  (!leftOnLine &&  rightOnLine) turnRight();
    else if  ( leftOnLine && !rightOnLine) turnLeft();
    else                                   Stop();
  }

  // ── Obstacle Avoid Mode ─────────────────────────────────────────────────
  if (mode == 2) {
    distance_F = Ultrasonic_read();
    Serial.print("Distance F: ");
    Serial.println(distance_F);

    if (distance_F > OBSTACLE_THRESHOLD) {
      forword();   // path is clear — keep going
    } else {
      // Obstacle detected — stop and handle it
      Stop();
      delay(300);
      avoidObstacle();
    }
  }

  delay(10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main obstacle avoidance logic:
//   1) Scan LEFT and RIGHT
//   2) If one side is clear → turn that way
//   3) If both sides are clear → turn to the one with more space
//   4) If BOTH sides are blocked → back up, stop, scan all 3 sides again
// ─────────────────────────────────────────────────────────────────────────────
void avoidObstacle() {
  // ── First scan: look left and right ──────────────────────────────────────
  scanSides();   // fills distance_L and distance_R, returns servo to center

  Serial.print("L="); Serial.print(distance_L);
  Serial.print(" R="); Serial.println(distance_R);

  bool leftClear  = (distance_L > OBSTACLE_THRESHOLD);
  bool rightClear = (distance_R > OBSTACLE_THRESHOLD);

  if (leftClear && rightClear) {
    // Both clear — pick the side with more space
    if (distance_L >= distance_R) {
      Serial.println("Both clear → turning LEFT (more space)");
      turnLeft();
      delay(500);
    } else {
      Serial.println("Both clear → turning RIGHT (more space)");
      turnRight();
      delay(500);
    }
    Stop();

  } else if (leftClear && !rightClear) {
    // Only left is clear
    Serial.println("Only LEFT clear → turning LEFT");
    turnLeft();
    delay(500);
    Stop();

  } else if (!leftClear && rightClear) {
    // Only right is clear
    Serial.println("Only RIGHT clear → turning RIGHT");
    turnRight();
    delay(500);
    Stop();

  } else {
    // ── Both sides blocked → back up, then re-scan all 3 sides ──────────
    Serial.println("Both sides blocked → backing up");
    backword();
    delay(600);
    Stop();
    delay(300);

    // Re-scan all three directions (left, front, right)
    scanAllThree();   // fills distance_L, distance_F, distance_R
    Serial.print("Re-scan → L="); Serial.print(distance_L);
    Serial.print(" F="); Serial.print(distance_F);
    Serial.print(" R="); Serial.println(distance_R);

    // Find the clearest direction
    if (distance_F > distance_L && distance_F > distance_R) {
      Serial.println("Front is clearest → going forward");
      forword();
      delay(400);
      Stop();
    } else if (distance_L >= distance_R) {
      Serial.println("Left is clearest after backup → turning LEFT");
      turnLeft();
      delay(600);
      Stop();
    } else {
      Serial.println("Right is clearest after backup → turning RIGHT");
      turnRight();
      delay(600);
      Stop();
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan LEFT then RIGHT, return servo to center
// ─────────────────────────────────────────────────────────────────────────────
void scanSides() {
  // Look LEFT
  for (int a = SERVO_CENTER; a <= SERVO_LEFT; a += 5) servoPulse(servo, a);
  delay(300);
  distance_L = Ultrasonic_read();
  Serial.print("Scan L: "); Serial.println(distance_L);

  // Look RIGHT
  for (int a = SERVO_LEFT; a >= SERVO_RIGHT; a -= 5) servoPulse(servo, a);
  delay(300);
  distance_R = Ultrasonic_read();
  Serial.print("Scan R: "); Serial.println(distance_R);

  // Return to center
  for (int a = SERVO_RIGHT; a <= SERVO_CENTER; a += 5) servoPulse(servo, a);
  delay(200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Scan all 3 directions: LEFT, FRONT (center), RIGHT
// ─────────────────────────────────────────────────────────────────────────────
void scanAllThree() {
  // Look LEFT
  for (int a = SERVO_CENTER; a <= SERVO_LEFT; a += 5) servoPulse(servo, a);
  delay(300);
  distance_L = Ultrasonic_read();
  Serial.print("3-Scan L: "); Serial.println(distance_L);

  // Look CENTER (front)
  for (int a = SERVO_LEFT; a >= SERVO_CENTER; a -= 5) servoPulse(servo, a);
  delay(300);
  distance_F = Ultrasonic_read();
  Serial.print("3-Scan F: "); Serial.println(distance_F);

  // Look RIGHT
  for (int a = SERVO_CENTER; a >= SERVO_RIGHT; a -= 5) servoPulse(servo, a);
  delay(300);
  distance_R = Ultrasonic_read();
  Serial.print("3-Scan R: "); Serial.println(distance_R);

  // Return to center
  for (int a = SERVO_RIGHT; a <= SERVO_CENTER; a += 5) servoPulse(servo, a);
  delay(200);
}

// ─── Servo Pulse ─────────────────────────────────────────────────────────────
void servoPulse(int pin, int angle) {
  int pwm = (angle * 11) + 500;
  digitalWrite(pin, HIGH);
  delayMicroseconds(pwm);
  digitalWrite(pin, LOW);
  delay(50);
}

// ─── Ultrasonic Sensor ───────────────────────────────────────────────────────
long Ultrasonic_read() {
  digitalWrite(trigger, LOW);
  delayMicroseconds(2);
  digitalWrite(trigger, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigger, LOW);
  long duration = pulseIn(echo, HIGH, 30000); // 30ms timeout
  long dist = duration / 29 / 2;
  // If timeout occurred (no echo), treat as very far (open space)
  if (dist == 0) dist = 250;
  return dist;
}

// ─── Motor Functions ─────────────────────────────────────────────────────────
void forword() {
  digitalWrite(in1, HIGH); digitalWrite(in2, LOW);
  digitalWrite(in3, LOW);  digitalWrite(in4, HIGH);
}

void backword() {
  digitalWrite(in1, LOW);  digitalWrite(in2, HIGH);
  digitalWrite(in3, HIGH); digitalWrite(in4, LOW);
}

void turnRight() {
  digitalWrite(in1, LOW);  digitalWrite(in2, HIGH);
  digitalWrite(in3, LOW);  digitalWrite(in4, HIGH);
}

void turnLeft() {
  digitalWrite(in1, HIGH); digitalWrite(in2, LOW);
  digitalWrite(in3, HIGH); digitalWrite(in4, LOW);
}

void Stop() {
  digitalWrite(in1, LOW); digitalWrite(in2, LOW);
  digitalWrite(in3, LOW); digitalWrite(in4, LOW);
}
`;

/* ---- Syntax highlight (line-by-line to prevent regex cross-contamination) ---- */
function highlight(code) {
  const keywords = ['void', 'int', 'bool', 'return', 'if', 'else', 'while', 'for',
                    'delay', 'true', 'false', 'const', 'unsigned', 'long'];

  return code.split('\n').map(line => {
    // 1. HTML escape
    line = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // 2. Split comment from code (find // not inside a string)
    let commentPart = '';
    let inStr = false, commentIdx = -1;
    for (let i = 0; i < line.length - 1; i++) {
      if (line[i] === '"') inStr = !inStr;
      if (!inStr && line[i] === '/' && line[i + 1] === '/') { commentIdx = i; break; }
    }
    if (commentIdx >= 0) {
      commentPart = `<span class="cm">${line.slice(commentIdx)}</span>`;
      line = line.slice(0, commentIdx);
    }

    // 3. Strings (only in code part, not comment)
    line = line.replace(/"([^"]*)"/g, '<span class="str">"$1"</span>');
    // 4. Numbers
    line = line.replace(/\b(\d+)\b/g, '<span class="num">$1</span>');
    // 5. Preprocessor
    line = line.replace(/(#\w+)/g, '<span class="mc">$1</span>');
    // 6. Keywords
    keywords.forEach(kw => {
      line = line.replace(new RegExp(`\\b${kw}\\b`, 'g'), `<span class="kw">${kw}</span>`);
    });
    // 7. Functions (identifier before '(')
    line = line.replace(/\b([a-zA-Z_]\w*)\s*(?=\()/g, '<span class="fn">$1</span>');

    return line + commentPart;
  }).join('\n');
}

const cleanCode = arduinoCode.trim();
const lines = cleanCode.split('\n');
const lineNumsEl = document.getElementById('lineNums');
const codeBlockEl = document.getElementById('codeBlock');

lineNumsEl.innerHTML = lines.map((_, i) => `<span>${i + 1}</span>`).join('');
codeBlockEl.innerHTML = highlight(cleanCode);

/* ---- Trap mouse wheel inside code window so page doesn't scroll ---- */
const codeBodyEl = document.querySelector('.code-body');
codeBodyEl.addEventListener('wheel', function (e) {
  const atTop    = codeBodyEl.scrollTop === 0;
  const atBottom = codeBodyEl.scrollTop + codeBodyEl.clientHeight >= codeBodyEl.scrollHeight;
  // Only let the event bubble when already at the edge
  if (!(atTop && e.deltaY < 0) && !(atBottom && e.deltaY > 0)) {
    e.stopPropagation();
  }
}, { passive: true });

/* ---- Copy button ---- */
document.getElementById('copyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(cleanCode).then(() => {
    const msg = document.getElementById('copyMsg');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2500);
  });
});

/* ============================================================
   FOOTER — BACK TO TOP
   ============================================================ */
const backToTopBtn = document.getElementById('backToTop');

window.addEventListener('scroll', () => {
  if (window.scrollY > 500) {
    backToTopBtn.style.opacity = '1';
    backToTopBtn.style.pointerEvents = 'auto';
  } else {
    backToTopBtn.style.opacity = '0';
    backToTopBtn.style.pointerEvents = 'none';
  }
});

backToTopBtn.addEventListener('click', () => {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
});

/* ---- Handle Newsletter Submission (UI only) ---- */
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = newsletterForm.querySelector('button');
    const input = newsletterForm.querySelector('input');
    
    // Simple visual feedback
    const originalContent = btn.innerHTML;
    btn.innerHTML = '✓';
    btn.style.background = '#28c840';
    input.value = '';
    input.placeholder = 'Subscribed!';
    input.disabled = true;
    
    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.style.background = '';
      input.placeholder = 'Your email address';
      input.disabled = false;
    }, 3000);
  });
}
