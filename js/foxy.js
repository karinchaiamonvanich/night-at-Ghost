// Foxy state machine — pure logic, no DOM/timers/jQuery.
// The game loop calls Foxy.tick(state, world) each tick and applies the
// returned effects (advance / sprint / pound / reset / jumpscare).
//
// world = {
//   viewingWestHall:  player is watching cam 2a (West Hall)
//   viewingCove:      player is watching cam 1c (Pirate Cove)
//   leftDoorClosed:   left door is down
//   ghostHoldingLeft: Door Ghost is currently holding the left door
//   night:            1..5
//   rand:             () => number in [0,1)  (injectable for tests)
// }
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.Foxy = factory();
    }
}(this, function () {
    'use strict';

    // Sprint lasts ~2.5s at the 10 ticks/sec game loop.
    var SPRINT_TICKS = 25;
    // A blocked sprint drains this percent of power.
    var POWER_DRAIN = 10;

    // Per-night chance (0..1) to advance one stage while the West Hall
    // camera is being viewed. Night 1 gentle, Night 5 aggressive.
    var VIEW_CHANCE = { 1: 0.012, 2: 0.018, 3: 0.024, 4: 0.030, 5: 0.038 };
    // Much smaller chance to creep on a tick when the West Hall is not
    // viewed, so never-looking is not a full counter. Watching the cove
    // freezes this entirely.
    var CREEP_CHANCE = 0.002;

    function viewChance(night) {
        return VIEW_CHANCE[night] || VIEW_CHANCE[5];
    }

    function create() {
        return { stage: 1, sprinting: false, sprintTicks: 0 };
    }

    function tick(state, world) {
        var effects = [];
        var s = { stage: state.stage, sprinting: state.sprinting, sprintTicks: state.sprintTicks };

        if (s.sprinting) {
            // Door Ghost holding the left door holds the sprint in place.
            if (world.ghostHoldingLeft) {
                return { state: s, effects: effects };
            }
            s.sprintTicks -= 1;
            if (s.sprintTicks <= 0) {
                s.sprinting = false;
                s.sprintTicks = 0;
                if (world.leftDoorClosed) {
                    effects.push('pound');
                    effects.push('reset');
                    s.stage = 1;
                } else {
                    effects.push('jumpscare');
                }
            }
            return { state: s, effects: effects };
        }

        var p;
        if (world.viewingWestHall) {
            p = viewChance(world.night);
        } else if (world.viewingCove) {
            p = 0; // cove view freezes the random creep
        } else {
            p = CREEP_CHANCE;
        }
        if (p > 0 && world.rand() < p) {
            s.stage += 1;
            effects.push('advance');
            if (s.stage >= 4) {
                s.stage = 4;
                s.sprinting = true;
                s.sprintTicks = SPRINT_TICKS;
                effects.push('sprint');
            }
        }
        return { state: s, effects: effects };
    }

    return {
        create: create,
        tick: tick,
        SPRINT_TICKS: SPRINT_TICKS,
        POWER_DRAIN: POWER_DRAIN
    };
}));
