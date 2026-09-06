// Power Repair minigame — pure logic, no DOM/timers/jQuery.
// Dead by Daylight–style timing test: a marker travels back and forth
// along a 0..100 bar; the player presses while it is inside the target
// zone. Three hits restore the power; a miss resets the progress.
//
// The game loop calls PowerRepair.tick(state, world) each tick to move
// the marker, and PowerRepair.press(state, world) on a player press.
//
// world (tick)   = { speed: marker position units per tick }
// world (press)  = { zoneStart, zoneEnd }  (inclusive)
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.PowerRepair = factory();
    }
}(this, function () {
    'use strict';

    // Presses needed to restore the power.
    var PRESSES_TO_COMPLETE = 3;
    // Marker speed: 100 units over 20 ticks = one full traverse per ~2s.
    var SPEED = 5;
    // Target zone: ~15% of the bar, centred.
    var ZONE_START = 42;
    var ZONE_END = 57;

    function create() {
        return { progress: 0, pos: 0, dir: 1, done: false };
    }

    function tick(state, world) {
        var s = { progress: state.progress, pos: state.pos, dir: state.dir, done: state.done };
        if (!s.done) {
            s.pos += world.speed * s.dir;
            if (s.pos >= 100) {
                s.pos = 100;
                s.dir = -1;
            } else if (s.pos <= 0) {
                s.pos = 0;
                s.dir = 1;
            }
        }
        return { state: s, effects: [] };
    }

    function press(state, world) {
        var s = { progress: state.progress, pos: state.pos, dir: state.dir, done: state.done };
        if (s.done) {
            return { state: s, result: 'done' };
        }
        if (s.pos >= world.zoneStart && s.pos <= world.zoneEnd) {
            s.progress += 1;
            if (s.progress >= PRESSES_TO_COMPLETE) {
                s.done = true;
                return { state: s, result: 'complete' };
            }
            return { state: s, result: 'hit' };
        }
        s.progress = 0;
        return { state: s, result: 'miss' };
    }

    return {
        create: create,
        tick: tick,
        press: press,
        PRESSES_TO_COMPLETE: PRESSES_TO_COMPLETE,
        SPEED: SPEED,
        ZONE_START: ZONE_START,
        ZONE_END: ZONE_END
    };
}));
