// Flappy Fågel – ett enkelt spel som liknar Flappy Bird.
// Styrning: mellanslag, pil upp, musklick eller tryck på skärmen.

const canvas = document.getElementById("spel");
const ctx = canvas.getContext("2d");

const BREDD = canvas.width;
const HOJD = canvas.height;
const MARK_HOJD = 80;

// Spelinställningar
const GRAVITATION = 0.45;
const HOPP_KRAFT = -7.5;
const ROR_BREDD = 60;
const ROR_GLAPP = 160;
const ROR_HASTIGHET = 2.5;
const ROR_AVSTAND = 220;

const TILLSTAND = { START: 0, SPELAR: 1, SLUT: 2 };

let tillstand = TILLSTAND.START;
let poang = 0;
let rekord = Number(lasRekord()) || 0;
let ror = [];
let markForskjutning = 0;
let bildruta = 0;

const fagel = {
  x: 90,
  y: HOJD / 2,
  radie: 14,
  fart: 0,
  vinkel: 0,
};

function lasRekord() {
  try {
    return localStorage.getItem("flappyRekord");
  } catch {
    return 0;
  }
}

function sparaRekord(varde) {
  try {
    localStorage.setItem("flappyRekord", varde);
  } catch {
    // Lagring ej tillgänglig – rekordet gäller bara denna session.
  }
}

function aterstall() {
  fagel.y = HOJD / 2;
  fagel.fart = 0;
  fagel.vinkel = 0;
  ror = [];
  poang = 0;
}

function skapaRor(x) {
  const minTopp = 60;
  const maxTopp = HOJD - MARK_HOJD - ROR_GLAPP - 60;
  const topp = minTopp + Math.random() * (maxTopp - minTopp);
  ror.push({ x, topp, passerat: false });
}

function hoppa() {
  if (tillstand === TILLSTAND.START) {
    aterstall();
    tillstand = TILLSTAND.SPELAR;
    skapaRor(BREDD + 100);
  } else if (tillstand === TILLSTAND.SLUT) {
    tillstand = TILLSTAND.START;
    return;
  }
  fagel.fart = HOPP_KRAFT;
}

function speletSlut() {
  tillstand = TILLSTAND.SLUT;
  if (poang > rekord) {
    rekord = poang;
    sparaRekord(rekord);
  }
}

function krockarMedRor(r) {
  // Cirkel-mot-rektangel-kollision för övre och nedre röret.
  const rektanglar = [
    { x: r.x, y: 0, b: ROR_BREDD, h: r.topp },
    { x: r.x, y: r.topp + ROR_GLAPP, b: ROR_BREDD, h: HOJD },
  ];
  return rektanglar.some(({ x, y, b, h }) => {
    const nx = Math.max(x, Math.min(fagel.x, x + b));
    const ny = Math.max(y, Math.min(fagel.y, y + h));
    const dx = fagel.x - nx;
    const dy = fagel.y - ny;
    return dx * dx + dy * dy < fagel.radie * fagel.radie;
  });
}

function uppdatera() {
  bildruta++;

  if (tillstand !== TILLSTAND.SLUT) {
    markForskjutning = (markForskjutning + ROR_HASTIGHET) % 24;
  }

  if (tillstand === TILLSTAND.START) {
    // Fågeln guppar lätt på startskärmen.
    fagel.y = HOJD / 2 + Math.sin(bildruta / 10) * 8;
    return;
  }

  // Fysik för fågeln (fortsätter falla även efter krock).
  fagel.fart += GRAVITATION;
  fagel.y += fagel.fart;
  fagel.vinkel = Math.max(-0.5, Math.min(Math.PI / 2, fagel.fart / 10));

  const markY = HOJD - MARK_HOJD;
  if (fagel.y + fagel.radie >= markY) {
    fagel.y = markY - fagel.radie;
    fagel.fart = 0;
    if (tillstand === TILLSTAND.SPELAR) speletSlut();
  }
  if (fagel.y - fagel.radie < 0) {
    fagel.y = fagel.radie;
    fagel.fart = 0;
  }

  if (tillstand !== TILLSTAND.SPELAR) return;

  for (const r of ror) {
    r.x -= ROR_HASTIGHET;
    if (!r.passerat && r.x + ROR_BREDD < fagel.x) {
      r.passerat = true;
      poang++;
    }
    if (krockarMedRor(r)) {
      speletSlut();
      return;
    }
  }

  ror = ror.filter((r) => r.x + ROR_BREDD > 0);
  const sista = ror[ror.length - 1];
  if (!sista || sista.x < BREDD - ROR_AVSTAND) {
    skapaRor(BREDD);
  }
}

// ---------- Ritning ----------

function ritaBakgrund() {
  ctx.fillStyle = "#70c5ce";
  ctx.fillRect(0, 0, BREDD, HOJD);

  // Moln
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  [[60, 100], [250, 160], [340, 80]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.arc(x + 20, y - 10, 24, 0, Math.PI * 2);
    ctx.arc(x + 42, y, 20, 0, Math.PI * 2);
    ctx.fill();
  });
}

function ritaRor() {
  for (const r of ror) {
    const nedreY = r.topp + ROR_GLAPP;
    ctx.fillStyle = "#5ec639";
    ctx.strokeStyle = "#2e6b1a";
    ctx.lineWidth = 3;

    ctx.fillRect(r.x, 0, ROR_BREDD, r.topp);
    ctx.strokeRect(r.x, -3, ROR_BREDD, r.topp + 3);
    ctx.fillRect(r.x, nedreY, ROR_BREDD, HOJD - MARK_HOJD - nedreY);
    ctx.strokeRect(r.x, nedreY, ROR_BREDD, HOJD - MARK_HOJD - nedreY);

    // Rörens kanter
    ctx.fillRect(r.x - 5, r.topp - 24, ROR_BREDD + 10, 24);
    ctx.strokeRect(r.x - 5, r.topp - 24, ROR_BREDD + 10, 24);
    ctx.fillRect(r.x - 5, nedreY, ROR_BREDD + 10, 24);
    ctx.strokeRect(r.x - 5, nedreY, ROR_BREDD + 10, 24);
  }
}

function ritaMark() {
  const y = HOJD - MARK_HOJD;
  ctx.fillStyle = "#ded895";
  ctx.fillRect(0, y, BREDD, MARK_HOJD);
  ctx.fillStyle = "#73bf2e";
  ctx.fillRect(0, y, BREDD, 14);
  ctx.fillStyle = "#5a9e22";
  for (let x = -markForskjutning; x < BREDD; x += 24) {
    ctx.fillRect(x, y + 10, 12, 4);
  }
}

function ritaFagel() {
  ctx.save();
  ctx.translate(fagel.x, fagel.y);
  ctx.rotate(fagel.vinkel);

  // Kropp
  ctx.fillStyle = "#f7d038";
  ctx.strokeStyle = "#8a6d00";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, fagel.radie + 3, fagel.radie, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Vinge som flaxar
  const flax = tillstand === TILLSTAND.SLUT ? 0 : Math.sin(bildruta / 3) * 4;
  ctx.fillStyle = "#fff4c2";
  ctx.beginPath();
  ctx.ellipse(-5, 2 + flax, 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Öga
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(7, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(9, -5, 2, 0, Math.PI * 2);
  ctx.fill();

  // Näbb
  ctx.fillStyle = "#f57c1f";
  ctx.beginPath();
  ctx.moveTo(13, 0);
  ctx.lineTo(23, 3);
  ctx.lineTo(13, 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function ritaText(text, y, storlek) {
  ctx.font = `bold ${storlek}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#fff";
  ctx.strokeText(text, BREDD / 2, y);
  ctx.fillText(text, BREDD / 2, y);
}

function ritaGranssnitt() {
  if (tillstand === TILLSTAND.SPELAR) {
    ritaText(String(poang), 80, 48);
  } else if (tillstand === TILLSTAND.START) {
    ritaText("Flappy Fågel", 160, 42);
    ritaText("Klicka eller tryck mellanslag", 400, 20);
    ritaText("för att flyga", 428, 20);
    if (rekord > 0) ritaText(`Rekord: ${rekord}`, 470, 20);
  } else {
    ritaText("Spelet slut!", 180, 42);
    ritaText(`Poäng: ${poang}`, 250, 28);
    ritaText(`Rekord: ${rekord}`, 290, 28);
    ritaText("Klicka för att fortsätta", 400, 20);
  }
}

function rita() {
  ritaBakgrund();
  ritaRor();
  ritaMark();
  ritaFagel();
  ritaGranssnitt();
}

// ---------- Spelloop med fast tidssteg ----------

const STEG_MS = 1000 / 60;
let senaste = performance.now();
let ackumulerat = 0;

function loop(nu) {
  ackumulerat += Math.min(nu - senaste, 250);
  senaste = nu;
  while (ackumulerat >= STEG_MS) {
    uppdatera();
    ackumulerat -= STEG_MS;
  }
  rita();
  requestAnimationFrame(loop);
}

// ---------- Inmatning ----------

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp") {
    e.preventDefault();
    if (!e.repeat) hoppa();
  }
});

canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  hoppa();
});

requestAnimationFrame(loop);
