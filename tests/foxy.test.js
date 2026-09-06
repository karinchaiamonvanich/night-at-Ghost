// Tests for the Foxy state machine (js/foxy.js) — pure logic, no DOM.
// Run with: node --test tests/foxy.test.js
const test = require('node:test');
const assert = require('node:assert');
const Foxy = require('../js/foxy.js');

// default world: nothing watched, door open, no ghost, Night 1,
// and a rand that never triggers an advance
function ctx(over) {
    return Object.assign({
        viewingWestHall: false,
        viewingCove: false,
        leftDoorClosed: false,
        ghostHoldingLeft: false,
        night: 1,
        rand: function () { return 0.999; }
    }, over);
}

test('create: starts at stage 1, not sprinting', () => {
    const s = Foxy.create();
    assert.equal(s.stage, 1);
    assert.equal(s.sprinting, false);
    assert.equal(s.sprintTicks, 0);
});

test('watching West Hall with a lucky roll advances one stage', () => {
    const r = Foxy.tick(Foxy.create(), ctx({ viewingWestHall: true, rand: () => 0.001 }));
    assert.equal(r.state.stage, 2);
    assert.ok(r.effects.includes('advance'));
});

test('watching West Hall with an unlucky roll does not advance', () => {
    const r = Foxy.tick(Foxy.create(), ctx({ viewingWestHall: true, rand: () => 0.5 }));
    assert.equal(r.state.stage, 1);
    assert.deepEqual(r.effects, []);
});

test('not watching: rare random creep advances', () => {
    const r = Foxy.tick(Foxy.create(), ctx({ rand: () => 0.0001 }));
    assert.equal(r.state.stage, 2);
    assert.ok(r.effects.includes('advance'));
});

test('watching the cove freezes the random creep', () => {
    const r = Foxy.tick(Foxy.create(), ctx({ viewingCove: true, rand: () => 0.0001 }));
    assert.equal(r.state.stage, 1);
    assert.deepEqual(r.effects, []);
});

test('reaching stage 4 starts the sprint on the same tick', () => {
    const s = { stage: 3, sprinting: false, sprintTicks: 0 };
    const r = Foxy.tick(s, ctx({ viewingWestHall: true, rand: () => 0.001 }));
    assert.equal(r.state.stage, 4);
    assert.equal(r.state.sprinting, true);
    assert.ok(r.effects.includes('sprint'));
});

test('sprint counts down one tick per tick', () => {
    const s = { stage: 4, sprinting: true, sprintTicks: 10 };
    const r = Foxy.tick(s, ctx({}));
    assert.equal(r.state.sprintTicks, 9);
    assert.deepEqual(r.effects, []);
});

test('sprint with open door ends in a jumpscare', () => {
    const s = { stage: 4, sprinting: true, sprintTicks: 1 };
    const r = Foxy.tick(s, ctx({ leftDoorClosed: false }));
    assert.ok(r.effects.includes('jumpscare'));
    assert.equal(r.state.sprinting, false);
});

test('sprint with closed door pounds, resets back to the cove', () => {
    const s = { stage: 4, sprinting: true, sprintTicks: 1 };
    const r = Foxy.tick(s, ctx({ leftDoorClosed: true }));
    assert.ok(r.effects.includes('pound'));
    assert.ok(r.effects.includes('reset'));
    assert.equal(r.state.stage, 1);
    assert.equal(r.state.sprinting, false);
});

test('Door Ghost holding the left door holds the sprint in place', () => {
    const s = { stage: 4, sprinting: true, sprintTicks: 10 };
    const r = Foxy.tick(s, ctx({ leftDoorClosed: true, ghostHoldingLeft: true }));
    assert.equal(r.state.sprintTicks, 10);
    assert.deepEqual(r.effects, []);
});

test('higher nights advance more often (chance table)', () => {
    // a roll of 0.02 advances on Night 5 (view chance 0.038) but not Night 1 (0.012)
    const r1 = Foxy.tick(Foxy.create(), ctx({ night: 1, viewingWestHall: true, rand: () => 0.02 }));
    const r5 = Foxy.tick(Foxy.create(), ctx({ night: 5, viewingWestHall: true, rand: () => 0.02 }));
    assert.equal(r1.state.stage, 1);
    assert.equal(r5.state.stage, 2);
});

test('a blocked sprint can sprint again after re-advancing', () => {
    // stage 1 -> 2 -> 3 -> 4 (sprint) via West Hall views
    let r = Foxy.tick(Foxy.create(), ctx({ viewingWestHall: true, rand: () => 0.001 }));
    r = Foxy.tick(r.state, ctx({ viewingWestHall: true, rand: () => 0.001 }));
    r = Foxy.tick(r.state, ctx({ viewingWestHall: true, rand: () => 0.001 }));
    assert.equal(r.state.sprinting, true);
    // run the sprint out with the door closed: it pounds and resets to stage 1
    let s = r.state;
    while (s.sprinting) {
        r = Foxy.tick(s, ctx({ leftDoorClosed: true }));
        s = r.state;
    }
    assert.ok(r.effects.includes('pound'));
    assert.ok(r.effects.includes('reset'));
    assert.equal(s.stage, 1);
    // and the cycle can start again
    r = Foxy.tick(s, ctx({ viewingWestHall: true, rand: () => 0.001 }));
    assert.equal(r.state.stage, 2);
});
