// cues.mjs: derive SFX cues from the picture's own timeline (timeline.json), ~0.03 s before each visual contact.
//   node tools/cues.mjs > cues.json
import { readFileSync } from 'node:fs';
const TL = JSON.parse(readFileSync('timeline.json', 'utf8'));
const S = id => TL.shots[id].from, Ln = id => TL.lines.find(l => l.id === id).from;
const cues = [];
const add = (t, type, vol = 0.4, pitch = 1, pan = 0) => cues.push({ t: +(t - 0.03).toFixed(3), type, vol, pitch, pan });

add(0.05, 'chime', 0.22, 0.9);                              // the alert
add(2.2, 'whoosh', 0.25);                                   // pull back to the phone
for (const id of ['s02', 's03', 's04', 's05', 's06', 's07', 's08', 's09']) add(S(id) - 0.18, 'swish', 0.22); // every seam
add(Ln('l03') - 0.1, 'pop', 0.3, 0.95, -0.3); add(Ln('l04') + 0.4, 'pop', 0.3, 1.1, 0.3);   // the two risks
[3.6, 5.4, 7.2].forEach((d, i) => add(Ln('l06') + d, 'tick', 0.35, 1 + i * 0.08));        // Telegram rings
add(Ln('l07') + 0.6, 'tick', 0.3); add(Ln('l07') + 2.9, 'tick', 0.3, 1.15);                // web rings
[2.4, 4.0, 5.2].forEach((d, i) => add(Ln('l08') + d, 'click', 0.35, 1 + i * 0.06));       // reserve, trigger, sign
[0.8, 3.6].forEach((d, i) => add(Ln('l10') + d, 'tick', 0.32, 1 + i * 0.1));             // explorer rows
add(Ln('l11') + 0.2, 'tick', 0.32, 1.2);
add(Ln('l11') + 3.0 + 2.0, 'success', 0.3);                                                // ratio lands on 148.77%
[2.0, 4.6].forEach(d => add(Ln('l12') + d + 0.6, 'error', 0.22));                          // the two refusals
[0.4, 1.6, 3.2].forEach((d, i) => add(Ln('l13') + d, 'pop', 0.26, 1 + i * 0.07));          // trust facts
add(S('s09') + 0.15, 'chime', 0.25, 1.0);                                                  // logo
console.log(JSON.stringify(cues.sort((a, b) => a.t - b.t), null, 1));
