// Headless smoke test: loads the REAL app.js against a fake DOM/jQuery and
// drives the real game loop (setInterval callback) through every system:
// time/power, animatronic AI, Foxy, ghost flicker + reboot, Door Ghost,
// power outage + fuse-box minigame, win/lose flows, and camera feeds.
//
// Run with:  node tests/smoke.js
'use strict';
const fs = require('fs');
const path = require('path');

const base = path.join(__dirname, '..');
let failures = 0;
function check(name, cond, extra) {
    if (cond) { console.log('PASS  ' + name); }
    else { failures++; console.log('FAIL  ' + name + (extra !== undefined ? '  [' + extra + ']' : '')); }
}

// ---------- deterministic PRNG (mulberry32) ----------
function mulberry32(a) {
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---------- fake DOM / jQuery ----------
const readyFns = [];
const intervals = [];
const els = {};
function elFor(key) {
    if (!els[key]) {
        els[key] = {
            id: key, volume: 1, currentTime: 0, paused: true, ended: false,
            play() { this.paused = false; return Promise.resolve(); },
            pause() { this.paused = true; }
        };
    }
    return els[key];
}
function wrapper(key) {
    const w = {
        0: elFor(key),
        get(i) { return i === undefined ? [elFor(key)] : elFor(key); },
        each(fn) { fn.call(elFor(key), 0); return w; },
        find() { return wrapper(key + '>find'); },
        html(v) { if (v !== undefined) { elFor(key).html = v; } return elFor(key).html; },
        attr(k, v) { if (v !== undefined) { elFor(key)[k] = v; } return w; },
        css() { return w; },
        addClass() { return w; }, removeClass() { return w; }, toggleClass() { return w; },
        on() { return w; }, click() { return w; },
        data() { return {}; }, parent() { return wrapper(key + '>parent'); },
        empty() { return w; }, removeAttr() { return w; }, src() { return w; }
    };
    return w;
}
function $(sel) {
    if (sel === 'document') { return { ready(fn) { readyFns.push(fn); } }; }
    return wrapper(typeof sel === 'string' ? sel : String(sel));
}

// ---------- globals app.js expects ----------
global.window = global;
global.document = { addEventListener() {}, removeEventListener() {} };
global.localStorage = {
    _m: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; },
    setItem(k, v) { this._m[k] = String(v); },
    removeItem(k) { delete this._m[k]; }
};
global.location = { href: '', reload() { this.href = 'reloaded'; } };

// capture the game-loop interval; run every timeout immediately so the
// scare/win/outage sequences complete synchronously
global.setInterval = function (fn) { intervals.push(fn); return intervals.length; };
global.clearInterval = function () {};
global.setTimeout = function (fn) { fn(); return 0; };
global.clearTimeout = function () {};

// ---------- load the real game code (pure modules + app.js) ----------
global.$ = $;
global.Foxy = require('../js/foxy.js');
global.PowerRepair = require('../js/power-repair.js');
(0, eval)(fs.readFileSync(path.join(base, 'js', 'app.js'), 'utf8'));

global.night = 1;
readyFns.forEach(function (fn) { fn(); });

const tickFn = intervals[0];
check('gamestart() registered the game loop (setInterval 100ms)', typeof tickFn === 'function');

// reset state between scenarios (a real game reloads the page; reset() alone
// does not touch gameEnd/hour/time/camera, so clear those too)
function freshNight(n) {
    global.night = n;
    global.gameEnd = false;
    global.hour = 0;
    global.currentTime = 0;
    global.cameraMode = 0;
    global.leftDoor = 0; global.rightDoor = 0;
    global.leftLight = 0; global.rightLight = 0;
    global.power = 100;
    global.currentUsage = 0;
    global.freddyInOffice = false;
    const r = global.rooms;
    Object.keys(r).forEach(function (k) {
        const atStage = (k === '1a');
        r[k].f = atStage ? 1 : 0;
        r[k].c = atStage ? 1 : 0;
        r[k].b = atStage ? 1 : 0;
        r[k].occupy = atStage ? 1 : 0;
    });
    global.reset();
}

// ================= A) full loop: time + power + all AI, no exceptions =================
freshNight(1);
Math.random = mulberry32(12345);
let maxHour = 0;
let loopOk = true;
try {
    for (let i = 0; i < 1200 && !global.gameEnd; i++) {
        if (i % 300 === 0) {
            global.cameraMode = global.cameraMode ? 0 : 1;
            if (global.cameraMode) { global._currentImgRoom = '2a'; }
        }
        if (i % 500 === 0) {
            global.leftDoor = global.leftDoor ? 0 : 1;
            global.rightDoor = global.rightDoor ? 0 : 1;
        }
        tickFn();
        maxHour = Math.max(maxHour, global.hour);
    }
} catch (e) {
    loopOk = false;
    console.log('      loop threw: ' + e.stack);
}
check('A: 1200 ticks (120s) with cameras/doors toggled — no exception', loopOk);
check('A: time advanced or a lose condition triggered', maxHour >= 1 || global.gameEnd,
    'maxHour=' + maxHour + ' gameEnd=' + global.gameEnd);

// ================= B) Foxy: forced advance -> sprint -> blocked by closed door =================
freshNight(1);
Math.random = function () { return 0; }; // force every advance roll
global.cameraMode = 1;
global._currentImgRoom = '2a';
global.leftDoor = 1;
global.foxy = { stage: 3, sprinting: false, sprintTicks: 0 };
tickFn();
check('B: watching West Hall at stage 3 starts the sprint', global.foxy.sprinting === true);
// tick until the sprint ends (pound); stop watching immediately so Foxy
// cannot advance into a second sprint while we assert
for (let i = 0; i < 40 && global.foxy.sprinting; i++) { tickFn(); }
global._currentImgRoom = '1a';
check('B: closed door -> pound + reset to stage 1', global.foxy.sprinting === false && global.foxy.stage === 1,
    JSON.stringify(global.foxy));
check('B: blocked sprint drained exactly 10% power', global.power === 90, 'power=' + global.power);

// ================= C) Foxy: sprint with open door -> jumpscare =================
freshNight(1);
Math.random = function () { return 0.5; };
global.foxy = { stage: 4, sprinting: true, sprintTicks: 1 };
global.leftDoor = 0;
tickFn();
check('C: open door at sprint end -> jumpscare (gameEnd)', global.gameEnd === true);

// ================= D) Door Ghost leaps -> power outage -> fuse-box repair =================
freshNight(1);
Math.random = function () { return 0.5; };
global._doorGhost.door = 'left';
global._doorGhost.atDoorTicks = 99;
global.leftLight = 0;
tickFn();
check('D: Door Ghost not driven away in 10s -> power outage starts',
    global._powerOutage.active === true && global.power === 0);
const o = global._powerOutage;
const frozen = o.frozenPower;
o.repair.pos = 50; global.powerRepairPress();
check('D: press in zone -> progress 1/3', o.repair.progress === 1, 'progress=' + o.repair.progress);
o.repair.pos = 50; global.powerRepairPress();
check('D: press in zone -> progress 2/3', o.repair.progress === 2, 'progress=' + o.repair.progress);
o.repair.pos = 50; global.powerRepairPress();
check('D: third hit -> power restored to the frozen value',
    o.active === false && global.power === frozen, 'power=' + global.power + ' frozen=' + frozen);

// ================= E) power hits 0 -> power-out sequence =================
freshNight(1);
Math.random = function () { return 0.5; };
global.power = 1;
global.currentUsage = 149; // one more tick of usage crosses the 150 threshold
tickFn();
check('E: power reaching 0 -> power-out sequence (gameEnd)', global.gameEnd === true);

// ================= F) survive to 6 AM -> next night persisted =================
freshNight(1);
Math.random = function () { return 0.5; };
global.hour = 5;
global.currentTime = global._oneHour * global._nightDiff.hourMult - 1;
tickFn();
check('F: 6 AM -> win, night advanced and saved',
    global.hour === 6 && global.night === 2 && global.localStorage.getItem('night') === '2',
    'hour=' + global.hour + ' night=' + global.night + ' saved=' + global.localStorage.getItem('night'));

// ================= G) ghost flicker trigger -> broken cam -> lockout -> reboot =================
freshNight(1);
Math.random = function () { return 0.5; };
global.cameraMode = 1;
global._ghost.camUpTicks = 149; // one more tick of camera-up crosses 150
tickFn();
check('G: 15s of camera-up triggers the ghost (camera breaks)',
    global._ghost.broken === true && global._ghost.lockTicks === 20,
    'broken=' + global._ghost.broken + ' lock=' + global._ghost.lockTicks);
for (let i = 0; i < 20; i++) { tickFn(); }
check('G: 2s reboot lockout expires', global._ghost.lockTicks === 0, 'lock=' + global._ghost.lockTicks);
global.ghostReboot();
check('G: reboot starts', global._ghost.rebooting === true);
for (let i = 0; i < 50; i++) { tickFn(); }
check('G: reboot completes -> camera healthy, ghost on cooldown, speed boost ends',
    global._ghost.rebooting === false && global._ghost.broken === false &&
    global._ghost.cooldown === 1200 && global._moveSpeedMult === 1,
    JSON.stringify(global._ghost));

// ================= H) every camera feed renders an existing asset =================
freshNight(1);
Math.random = function () { return 0.5; };
const cams = [
    ['resources/img/rooms/1a_show_stage/cam_1a_', '1a', 'png'],
    ['resources/img/rooms/1b_dining_area/1b_', '1b', 'png'],
    ['resources/img/rooms/2a_west_hall/2a_', '2a', 'gif'],
    ['resources/img/rooms/2b_west_hall_corner/2b_', '2b', 'png'],
    ['resources/img/rooms/3_supply_closet/3_', '3', 'png'],
    ['resources/img/rooms/4a_east_hall/4a_', '4a', 'png'],
    ['resources/img/rooms/4b_east_hall_corner/4b_', '4b', 'png'],
    ['resources/img/rooms/5_backstage/5_', '5', 'png'],
    ['resources/img/rooms/6_kitchen/6_b0_c0_f0.png', '6', 'png'],
    ['resources/img/rooms/7_restroom/7_', '7', 'png']
];
let camOk = true;
for (let i = 0; i < cams.length; i++) {
    const c = cams[i];
    global.updateCamImg(c[0], c[1], c[2]);
    const src = elFor('#camera-bg1 img').src;
    if (typeof src !== 'string' || !fs.existsSync(path.join(base, src))) {
        camOk = false;
        console.log('      missing feed asset for cam ' + c[1] + ': ' + src);
    }
}
check('H: all 10 camera feeds resolve to existing image files', camOk);

// ================= I) power-usage bar image exists for every usage level =================
let usageOk = true;
for (let u = 1; u <= 6; u++) {
    global.leftDoor = 0; global.rightDoor = 0; global.leftLight = 0; global.rightLight = 0; global.cameraMode = 0;
    // build a combination that totals u (base 1)
    const parts = [];
    let rest = u - 1;
    if (rest >= 1) { parts.push('cameraMode'); rest--; }
    if (rest >= 1) { parts.push('rightLight'); rest--; }
    if (rest >= 1) { parts.push('leftLight'); rest--; }
    if (rest >= 1) { parts.push('rightDoor'); rest--; }
    if (rest >= 1) { parts.push('leftDoor'); rest--; }
    parts.forEach(function (p) { global[p] = 1; });
    global.updatePowerUsage();
    const src = elFor('#usage-counter img').src;
    if (typeof src !== 'string' || !fs.existsSync(path.join(base, src))) {
        usageOk = false;
        console.log('      missing usage asset for ' + u + ': ' + src);
    }
}
check('I: batt_usage_N.png exists for usage levels 1-6', usageOk);

// ---------- result ----------
console.log(failures === 0 ? '\nALL SMOKE TESTS PASSED' : '\n' + failures + ' SMOKE TEST(S) FAILED');
process.exit(failures === 0 ? 0 : 1);
