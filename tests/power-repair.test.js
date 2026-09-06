// Tests for the Power Repair minigame (js/power-repair.js) — pure logic, no DOM.
// Run with: node --test tests/power-repair.test.js
const test = require('node:test');
const assert = require('node:assert');
const PowerRepair = require('../js/power-repair.js');

// default world: default speed and default zone
function ctx(over) {
    return Object.assign({
        speed: PowerRepair.SPEED,
        zoneStart: PowerRepair.ZONE_START,
        zoneEnd: PowerRepair.ZONE_END
    }, over);
}

test('create: starts at zero progress, marker at the left edge, not done', () => {
    const s = PowerRepair.create();
    assert.equal(s.progress, 0);
    assert.equal(s.pos, 0);
    assert.equal(s.dir, 1);
    assert.equal(s.done, false);
});

test('tick: marker moves forward by the speed each tick', () => {
    const r = PowerRepair.tick(PowerRepair.create(), ctx());
    assert.equal(r.state.pos, PowerRepair.SPEED);
    assert.equal(r.state.dir, 1);
    assert.deepEqual(r.effects, []);
});

test('tick: marker bounces at the right edge and reverses direction', () => {
    const s = { progress: 0, pos: 100 - PowerRepair.SPEED, dir: 1, done: false };
    const r = PowerRepair.tick(s, ctx());
    assert.equal(r.state.pos, 100);
    assert.equal(r.state.dir, -1);
    const r2 = PowerRepair.tick(r.state, ctx());
    assert.equal(r2.state.pos, 100 - PowerRepair.SPEED);
    assert.equal(r2.state.dir, -1);
});

test('tick: marker bounces at the left edge and reverses direction', () => {
    const s = { progress: 0, pos: PowerRepair.SPEED, dir: -1, done: false };
    const r = PowerRepair.tick(s, ctx());
    assert.equal(r.state.pos, 0);
    assert.equal(r.state.dir, 1);
});

test('tick: marker never leaves the 0..100 range at any speed', () => {
    let s = PowerRepair.create();
    for (let i = 0; i < 1000; i++) {
        s = PowerRepair.tick(s, ctx({ speed: 7 })).state;
        assert.ok(s.pos >= 0 && s.pos <= 100, 'pos out of range: ' + s.pos);
    }
});

test('press: inside the zone increments progress', () => {
    const s = { progress: 0, pos: (PowerRepair.ZONE_START + PowerRepair.ZONE_END) / 2, dir: 1, done: false };
    const r = PowerRepair.press(s, ctx());
    assert.equal(r.result, 'hit');
    assert.equal(r.state.progress, 1);
});

test('press: outside the zone resets progress to zero', () => {
    const s = { progress: 2, pos: 0, dir: 1, done: false };
    const r = PowerRepair.press(s, ctx());
    assert.equal(r.result, 'miss');
    assert.equal(r.state.progress, 0);
});

test('press: zone boundaries are inclusive', () => {
    let s = { progress: 0, pos: PowerRepair.ZONE_START, dir: 1, done: false };
    assert.equal(PowerRepair.press(s, ctx()).result, 'hit');
    s = { progress: 0, pos: PowerRepair.ZONE_END, dir: 1, done: false };
    assert.equal(PowerRepair.press(s, ctx()).result, 'hit');
});

test('press: three hits complete the repair', () => {
    let s = { progress: 0, pos: 50, dir: 1, done: false };
    let r = PowerRepair.press(s, ctx());
    assert.equal(r.result, 'hit');
    r = PowerRepair.press(r.state, ctx());
    assert.equal(r.result, 'hit');
    r = PowerRepair.press(r.state, ctx());
    assert.equal(r.result, 'complete');
    assert.equal(r.state.progress, PowerRepair.PRESSES_TO_COMPLETE);
    assert.equal(r.state.done, true);
});

test('press: a miss after partial progress resets it', () => {
    let s = { progress: 0, pos: 50, dir: 1, done: false };
    s = PowerRepair.press(s, ctx()).state; // 1
    s = PowerRepair.press(s, ctx()).state; // 2
    s = { progress: s.progress, pos: 0, dir: 1, done: false };
    const r = PowerRepair.press(s, ctx());
    assert.equal(r.result, 'miss');
    assert.equal(r.state.progress, 0);
});

test('press: after completion further presses do nothing', () => {
    const s = { progress: 3, pos: 50, dir: 1, done: true };
    const r = PowerRepair.press(s, ctx());
    assert.equal(r.state.done, true);
    assert.equal(r.state.progress, PowerRepair.PRESSES_TO_COMPLETE);
});

test('constants: the zone is ~15% of the bar and centred', () => {
    assert.equal(PowerRepair.ZONE_END - PowerRepair.ZONE_START, 15);
    assert.equal(PowerRepair.ZONE_START, 42);
    assert.equal(PowerRepair.ZONE_END, 57);
});

test('constants: marker speed is one full traverse per ~2s (100 units / 20 ticks)', () => {
    assert.equal(PowerRepair.SPEED, 5);
});
