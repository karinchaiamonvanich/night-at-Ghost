var hour = 0;
var hourInterval = null; // 1 game hour == 86 rl seconds = 28 game seconds
var jumpReady = false;
var leftDoor = 0;
var leftLight = 0;
var leftDisabled = 0;
var rightDoor = 0;
var rightLight = 0;
var rightDisabled = 0;
var cameraMode = 0;
var _repairMode = 0; // 0 = camera view, 1 = on the Repair Screen (camera still counts as raised)
var showStage = [1, 1, 1];
var activeCamImg;
var night = 1;
var timesPlayed = 0;
// master volume (0-100) set on the start screen, persisted in localStorage.
// Applied to every audio element EXCEPT the jumpscares, which stay at full volume.
var masterVolume = 100;
var _jumpscareIds = { 'scare': 1, 'window-scare': 1 };
function applyMasterVolume() {
    var v = masterVolume / 100;
    $('audio').each(function () {
        if (_jumpscareIds[this.id]) return;
        this.volume = v;
    });
}
var power = 100;
//var powerUsage = (leftDoor + rightDoor + rightLight + leftLight + cameraMode + 1);
//var decrementPower = 15000 / powerUsage;
var time = 1;
var cam1aClicks = 0;
var order;
var rooms = {
    '1a': { f: 1, c: 1, b: 1 },
    '1b': { f: 0, c: 0, b: 0, occupy: 0 },
    '1c': { f: 0, c: 0, b: 0, occupy: 0 },
    '2a': { f: 0, c: 0, b: 0, occupy: 0 },
    '2b': { f: 0, c: 0, b: 0, occupy: 0 },
    '4a': { f: 0, c: 0, b: 0, occupy: 0 },
    '4b': { f: 0, c: 0, b: 0, occupy: 0 },
    '3': { f: 0, c: 0, b: 0, occupy: 0 },
    '5': { f: 0, c: 0, b: 0, occupy: 0 },
    '6': { f: 0, c: 0, b: 0, occupy: 0 },
    '7': { f: 0, c: 0, b: 0, occupy: 0 },
    'safe': { f: 0, c: 0, b: 0 }
};
//time and power
var _oneHour = 860; //ticks per hour
var currentTime = 0;
var _perPowerUsage = 150; //ticks per powerbar
var currentUsage = 0;

// ===== Per-night difficulty =====
// One table keyed by night (1-5). Read once when the night starts (reset());
// nothing mid-night depends on it. Later nights are strictly harder:
// animatronics move more often (AI level), power drains faster, hours run
// longer, and the Door Ghost appears more frequently.
var _nightTable = {
    1: { aiB: 2,  aiC: 1,  aiF: 1, powerMult: 1.0, hourMult: 1.00, ghostFirst: [300, 600], ghostNext: [450, 900] },
    2: { aiB: 4,  aiC: 3,  aiF: 2, powerMult: 1.1, hourMult: 1.05, ghostFirst: [250, 500], ghostNext: [400, 750] },
    3: { aiB: 6,  aiC: 5,  aiF: 4, powerMult: 1.2, hourMult: 1.10, ghostFirst: [200, 450], ghostNext: [350, 650] },
    4: { aiB: 8,  aiC: 7,  aiF: 5, powerMult: 1.3, hourMult: 1.15, ghostFirst: [150, 350], ghostNext: [300, 550] },
    5: { aiB: 10, aiC: 9,  aiF: 7, powerMult: 1.4, hourMult: 1.20, ghostFirst: [100, 300], ghostNext: [250, 450] }
};
var _nightDiff = _nightTable[1]; // applied by reset() from the saved night

// random integer in the inclusive range [min, max] (ticks)
function rndRange(min, max) { return min + rnd(max - min); }

//cameraState
var _currentImgPath = 'resources/img/rooms/1a_show_stage/cam_1a_';
var _currentImgRoom = '1a';

// ===== Ghost flicker system =====
// Triggered by watching the cameras too long, or flipping them too rapidly.
// Sequence: faint full-screen flicker -> full flash -> shock (blur/blink/breath)
//           -> camera breaks (shows static, needs a reboot).
var _ghostLongTicks = 150;      // 15s of continuous camera-up
var _ghostRapidWindow = 100;    // 10s window for counting toggles
var _ghostRapidCount = 6;       // toggles within the window that trigger it
var _ghostFlickerMs = 4000;     // how long the faint flicker lasts
var _ghostRebootTicks = 50;     // 5s to reboot the camera
var _ghostRebootLockTicks = 20; // 2s after the fault before REBOOT can be pressed
var _ghostCooldownTicks = 1200; // 2min before it can trigger again
var _ghostFlashHoldMs = 350;    // how long the full flash holds before fading out
var _ghostFadeMs = 150;         // fade-out wait (covers the overlay's 0.12s opacity transition)
var _ghostTick = 0;
// Ghost Speed Boost: divisor on the animatronics' movement-check interval.
// 1 = normal, 2 = the danger window after a Ghost hit (they roll to move
// twice as often). Fixed (never stacks); reset to 1 when the ghost sequence
// ends (the reboot-completion reset remains as a backstop).
var _moveSpeedMult = 1;
var _ghost = {
    active: false,
    cooldown: 0,
    camUpTicks: 0,
    toggleTimes: [],
    broken: false,
    rebooting: false,
    rebootTicks: 0,
    lockTicks: 0,
    rebootWasBroken: false,
    rebootDone: false
};
var _ghostFlickerTimer = null;
var _brokenCamTimer = null;

// ===== Door Ghost system =====
// A second, distinct Ghost manifestation: it randomly appears standing at the
// left or right door, visible only when that door's light is on. Drive it away
// by holding the matching light on for 5s; if it is not driven away within 10s
// it leaps into the office and runs the existing Ghost penalty sequence. It
// has its own cooldown, separate from the camera-abuse Ghost's.
var _doorGhostHoldTicks = 50;        // 5s of continuous light to drive it away
var _doorGhostAtDoorTicks = 100;     // 10s at the door before it leaps in
var _doorGhostCooldownTicks = 2100;  // 3min 30s before it can appear again
var _doorGhostPostAnimTicks = 150;   // 15s after an animatronic leaves a door
var _doorGhost = {
    door: null,     // 'left' | 'right' | null — which door it is holding
    atDoorTicks: 0, // how long it has been at the door
    holdTicks: 0,   // how long the matching light has been held on continuously
    cooldown: 0,    // countdown after a hit
    spawnIn: 0,     // countdown to the next appearance
    leftWait: 0,    // post-animatronic wait for the left door
    rightWait: 0,   // post-animatronic wait for the right door
    prevSafeB: 0,   // last tick's safe-room occupancy (detects an animatronic leaving)
    prevSafeC: 0
};

var bonnie = new moveAI('Bonnie', 'b', 'left', 'resources/img/rooms/safe_room/bonnie_jumpscare.gif', ['1a', '1b', '3', '6', '5', '2b', 'safe']);
var chick = new moveAI('Chick', 'c', 'right', 'resources/img/rooms/safe_room/chika_jumpscare.gif', ['1a', '1b', '7', '6', '4a', '4b', 'safe']);
// Freddy: the slowest of the four — classic route through the kitchen to the
// right door. Lowest AI level every night (aiF in the difficulty table).
var freddy = new moveAI('Freddy', 'f', 'right', 'resources/img/rooms/safe_room/power_down_freddy_scare.gif', ['1a', '1b', '5', '6', '4a', '4b', 'safe']);
// set when Freddy has entered the office (enterOffice clears his room flag,
// so this flag is the only way to know he is inside for the power-out check)
var freddyInOffice = false;
var gameEnd = false;

// ===== Foxy =====
// Stage-based state machine (js/foxy.js — pure logic, unit-tested). Stage 1 =
// Pirate Cove; watching the West Hall cam (2a) advances him, plus a rare
// random creep when unwatched. Stage 4 = sprint down the West Hall to the
// left door: closed door pounds it and drains power, open door jumpscares.
var foxy = Foxy.create();

var motioLeftDoor;

// reset
function reset() {
    // apply this night's difficulty row (clamped to 1-5; a saved night beyond
    // 5 is handled as game-complete by The End screen, not played)
    _nightDiff = _nightTable[night] || _nightTable[1];
    jumpReady = false;
    powerOutAttacked = false;
    alreadyAttacked = false;
    rightDoor = 0;
    leftDoor = 0;
    power = 100;
    cam1aClicks = 0;
    freddyInOffice = false;
    foxy = Foxy.create();
    // reset the ghost flicker system
    _ghostTick = 0;
    _ghost = { active: false, cooldown: 0, camUpTicks: 0, toggleTimes: [], broken: false, rebooting: false, rebootTicks: 0, lockTicks: 0, rebootWasBroken: false, rebootDone: false };
    _repairMode = 0;
    _moveSpeedMult = 1;
    // reset the door ghost system (rolls the first appearance interval)
    _doorGhost = { door: null, atDoorTicks: 0, holdTicks: 0, cooldown: 0, spawnIn: rndRange(_nightDiff.ghostFirst[0], _nightDiff.ghostFirst[1]), leftWait: 0, rightWait: 0, prevSafeB: 0, prevSafeC: 0 };
    $('#repair-screen').removeClass('display-1').addClass('display-0');
    $('#camera-repair').removeClass('display-1').addClass('display-0');
    $('#repair-state').empty();
    $('#repair-error').removeClass('display-1').addClass('display-0');
    if (_ghostFlickerTimer) { clearInterval(_ghostFlickerTimer); _ghostFlickerTimer = null; }
    if (_brokenCamTimer) { clearInterval(_brokenCamTimer); _brokenCamTimer = null; }
    $('#ghost-overlay').removeClass('display-1 ghost-flash ghost-shock').addClass('display-0');
    $('.container').removeClass('ghost-shock-screen');
    $('#cam-fault-indicator').removeClass('display-1').addClass('display-0');
    // location.replace('/index.html');
}

// Browsers block audio.play() until the user has interacted with the page.
// The game auto-starts on load (no gesture on this document), so play() can
// reject with NotAllowedError. playSafe() swallows that rejection and retries
// on the first user interaction, so the error never shows up in the console.
//
// IMPORTANT: the unlock must retry EVERY audio element, not just the one that
// rejected — the browser's autoplay policy unlocks the whole page on one
// gesture, and any element that was never .play()ed before that gesture
// (e.g. the office ambience when the player never clicked the start screen)
// would otherwise stay silent forever.
var _audioUnlocked = false;
function unlockAllAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    // retry every element that already had a play() attempt (marked by
    // playSafe) — not just the one that rejected — so nothing that was
    // supposed to be playing stays silent
    $('audio').each(function () {
        var el = this;
        if (el._playRequested && el.paused && !el.ended) {
            el.play().catch(function () {});
        }
    });
    if (_ghostAudioCtx && _ghostAudioCtx.state === 'suspended') { _ghostAudioCtx.resume(); }
}
function playSafe($el) {
    var el = $el.get(0);
    if (!el) return;
    el._playRequested = true;
    var p = el.play();
    if (p && typeof p.catch === 'function') {
        p.catch(function (err) {
            if (err && err.name === 'NotAllowedError') {
                if (_audioUnlocked) return;
                var unlock = function () {
                    unlockAllAudio();
                    document.removeEventListener('click', unlock);
                    document.removeEventListener('keydown', unlock);
                    document.removeEventListener('touchstart', unlock);
                };
                document.addEventListener('click', unlock);
                document.addEventListener('keydown', unlock);
                document.addEventListener('touchstart', unlock);
            }
        });
    }
}

// The ghost sounds need to play louder than 1.0, but element.volume is capped
// at 1.0 by the browser. Route those two elements through a Web Audio GainNode
// (3x) so the master-volume slider still scales them on top of the boost.
var _ghostAudioCtx = null;
function boostGhostAudio() {
    var ids = ['ghost-breath', 'ghost-sound'];
    if (!_ghostAudioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return; // no Web Audio support — fall back to normal volume
        _ghostAudioCtx = new AC();
    }
    ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || el._boosted) return;
        el._boosted = true;
        var src = _ghostAudioCtx.createMediaElementSource(el);
        var gain = _ghostAudioCtx.createGain();
        gain.gain.value = 5;
        src.connect(gain);
        gain.connect(_ghostAudioCtx.destination);
    });
}

function gamestart() {
    boostGhostAudio();
    initGameTime();
    toggleLeftLight();
    toggleRightLight();
    updatePowerUsage();
    // restore master volume from the start screen (default 100)
    var storedVol = parseInt(localStorage.getItem('volume'), 10);
    if (isNaN(storedVol) || storedVol < 0 || storedVol > 100) storedVol = 100;
    masterVolume = storedVol;
    applyMasterVolume();
    $("#game-start")[0].volume = 0.3 * (masterVolume / 100);
    playSafe($("#game-start"));
    playSafe($("#ambience2"));
}


//constants running game ticks
function initGameTime() {
    setInterval(function () {
        if (!gameEnd) {
            burnTime();
            burnPower();
            ghostTick();
            doorGhostTick();
        }
        bonnie.tick();
        chick.tick();
        freddy.tick();
        foxyTick();
    }, 100);
}

//logic to burn power
function burnPower() {
    var powerUsage = (leftDoor*2) + (rightDoor*2) + rightLight + leftLight + cameraMode + 1;
    currentUsage += powerUsage;
    // later nights drain power faster (shorter ticks-per-powerbar)
    if (currentUsage >= _perPowerUsage / _nightDiff.powerMult) {
        power -= 1;
        $('#power-counter').html(power);
        currentUsage = 0;

        if (power == 0) { startPowerOut(); }
    }
}

// The power-out sequence. Called from burnPower when the last point of power
// is used, and from foxyTick when a blocked Foxy sprint drains power to zero.
function startPowerOut() {
    console.log('GAME LOSE ->> Out of power');
    gameEnd = true;
    //deactive door
    if (rightDoor) { rightDoor = 0; toggleDoor('right', rightDoor); }
    if (leftDoor) { leftDoor = 0; toggleDoor('left', leftDoor); }
    // If Freddy is near the office when the power dies, he appears in the
    // dark office instead of the classic Foxy-run cutscene (checked once —
    // the occupancy flags don't change after gameEnd).
    var freddyNearOffice = rooms['4b'].f || freddyInOffice;
    //power out
    setTimeout(function () {
        $('.to-hide').css('display', 'none');
        $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_power_0.png');

        $('.camera-menu').removeClass('display-0, display-1').addClass('display-0');
        $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-0');

        $('#powerout-sound').get(0).play();
        $('#call'+night+'').get(0).pause();
        $('#game-start').get(0).pause();
        $('#ambience2').get(0).pause();
    }, 600);

    if (freddyNearOffice) {
        // Freddy in the dark office, then his jumpscare (no Foxy run)
        setTimeout(function () {
            $('.main-screen').attr('src', 'resources/img/rooms/safe_room/rightside_freddy_scare.gif');
        }, 12000);
    } else {
        setTimeout(function () {
            $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_powerdown_foxy.gif');
            $("#powerout-jingle").get(0).play();
        }, 12000);

        setTimeout(function () {
            $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_powerdown_end.gif');
            $("#powerout-jingle").get(0).pause();
        }, 26000);
    }

    // the power-out always ends with Freddy's jumpscare
    setTimeout(function() {
        $('.main-screen').attr('src', 'resources/img/rooms/safe_room/power_down_freddy_scare.gif');
        //play sounds
        setTimeout(function () { $("#scare").get(0).play(); }, 600);
        setTimeout(function () { $("#scare").get(0).pause(); restart(); }, 1000);
    }, (28000 + (rnd(5)*1000)));
}

//constant running night
function burnTime() {
    currentTime += 1;
    // later nights run longer hours (more ticks per hour)
    if (currentTime >= _oneHour * _nightDiff.hourMult) {
        hour++;
        $('#hour-counter').html(hour);
        currentTime = 0;

        if (hour == 6) {
            console.log('GAME WIN ->> Proceed next night');
            gameEnd = true;
            night++;
            $('.to-hide').css('display', 'none');
            $('.camera-menu').removeClass('display-0, display-1').addClass('display-0');
            $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-0');
            $('.main-screen').attr('src', 'resources/img/game/5_to_6.gif');

            //sounds
            if (night < 6) {
                $('#call'+night+'').get(0).pause();
            }
            $('#win-sound').get(0).play();
            setTimeout(function () { $('#win-cheer').get(0).play(); }, 2000);
            ++timesPlayed;
            console.log(timesPlayed);
            localStorage.setItem('night', String(night));
            localStorage.removeItem('timesPlayed');
            localStorage.setItem('timesPlayed', String(timesPlayed));

            // Surviving Night 5 completes the game: The End instead of a Night 6
            if (night > 5) {
                setTimeout(function () { showTheEnd(); }, 10000);
            } else {
                setTimeout(function() {
                    location.reload();
                }, 10000);
            }
        }
    }
}

//update power image
function updatePowerUsage() {
    powerUsage = leftDoor + rightDoor + rightLight + leftLight + cameraMode + 1;
    $('#usage-counter img').attr('src', 'resources/img/game/batt_usage_'+powerUsage+'.png');
}


//default movingAI
// Original-game style movement: every 4-9s (halved while the Ghost Speed
// Boost is active) the animatronic rolls a 1-20 die and advances ONE room
// forward along its fixed route if the roll is <= its AI level (per-night,
// from the difficulty table). It never skips rooms or moves backward on its
// own — the only backward move is the retreat after a blocked attack.
// Shared jumpscare sequence: scare gif + scream, fade to static, then
// restart. Used by the moveAI animatronics (which call it only when the
// camera is down) and by Foxy (whose sprint can finish while the camera is
// up, so he hides the camera overlay first).
function doJumpscare(scareSrc) {
    $('.to-hide').css('display', 'none');
    $('.main-screen').attr('src', scareSrc);

    $("#scare").get(0).play();
    setTimeout(function () {
        $("#scare").get(0).pause();
        $('.camera-cycle').get(0).play();
        $('.main-screen').attr('src', 'resources/img/game/transition-fade.gif');
    }, 2000);

    setTimeout(function () {
        $('#gameover-static').get(0).play();
        $('.main-screen').attr('src', 'resources/img/game/static.gif');
    }, 2200);

    gameEnd = true;
    setTimeout(function () { restart(); }, 8000);
}

function moveAI(paraName, paraID, paraDoor, paraScare, paraPath) {
    var checkIn = 39 + rnd(51); // 40-90 ticks (4-9s) until the first movement check
    var attackPower = 0;
    var maxAttackPower = 300;
    var roomPath = paraPath;
    var myName = paraName;
    var myId = paraID;
    var scareScreen = paraScare;
    var scareDoor = paraDoor;
    var currentRoom = 0;
    var insideRoom = 0;
    var insideRoomPower = 0;
    var flipCam = 0;

    var tick = function () {
        // a jumpscare sets gameEnd, which stops every animatronic
        if (!gameEnd) {
            //check if in room
            if (insideRoom) {
                if (flipCam) { scare(); }
                else {
                    flipCam = cameraMode;
                    insideRoomPower += rnd(10);
                    if (insideRoomPower >= 1000) { scare(); }
                }
            }
            else if (roomPath[currentRoom] == 'safe') {
                attack();
            }
            else {
                // _moveSpeedMult halves the check interval while the Ghost Speed
                // Boost is active (a fixed 2x, never stacked); it does not
                // affect the attack charge or the in-office scare charge.
                checkIn--;
                if (checkIn <= 0) {
                    checkIn = (39 + rnd(51)) / _moveSpeedMult;
                    move();
                }
            }
        }
    }

    // transfer this animatronic to a new room on its path and play the move sound
    var goTo = function (newRoom) {
        rooms[roomPath[currentRoom]][myId] = 0;
        rooms[roomPath[currentRoom]].occupy = 0;
        currentRoom = newRoom;
        rooms[roomPath[currentRoom]][myId] = 1;
        rooms[roomPath[currentRoom]].occupy = 1;
        $('#move-sound').get(0).pause();
        $('#move-sound').get(0).currentTime = 0;
        $('#move-sound').get(0).play();
    }

    var move = function () {
        // watching this animatronic's room on a camera freezes it
        if (cameraMode && (_currentImgRoom == roomPath[currentRoom])) { console.log(myName + ' is frozen by the camera'); return; }
        // dice roll: advance only if the roll is <= this night's AI level
        // (read live from _nightDiff — the instances are built before reset()
        // applies the night, so a construction-time snapshot would be stale)
        var level = { b: _nightDiff.aiB, c: _nightDiff.aiC, f: _nightDiff.aiF }[myId];
        if (rnd(20) > level) { return; }
        // forward one room only (never past the safe room)
        var newRoom = currentRoom + 1;
        if (newRoom >= roomPath.length) { return; }
        if (rooms[roomPath[newRoom]].occupy) { return; } // target occupied: wait for the next check
        goTo(newRoom);
        console.log(myName + ' moved to', roomPath[currentRoom]);
    }

    // retreat to a random earlier room on the route (only ever called from the
    // safe room; never forward, never the door room)
    var retreat = function () {
        var newRoom = rnd(currentRoom) - 1; // 0..currentRoom-1
        if (rooms[roomPath[newRoom]].occupy) { return; }
        if (cameraMode && (_currentImgRoom == roomPath[newRoom])) { return; }
        goTo(newRoom);
        console.log(myName + ' retreated to', roomPath[currentRoom]);
    }

    var attack = function () {
        doorStatus = (scareDoor == 'left') ? leftDoor : rightDoor;
        // the Door Ghost is holding this door: wait here until it is gone
        // (no attack charge, no retreat) — the ghost is the priority threat
        if (doorGhostHolding(scareDoor)) {
            attackPower = 0;
            return;
        }
        if (!doorStatus) {
            console.log(myName + ' preparing to attack:', attackPower + '/' + maxAttackPower);
            attackPower += rnd(10);
            if (attackPower >= maxAttackPower) { enterOffice(); }
        }
        else {
            console.log(myName + ' attack is blocked');
            attackPower = 0;
            if (rnd(5) == 5) { retreat(); }
        }
    }

    var enterOffice = function () {
        //set attributes
        insideRoom = 1;
        rooms[roomPath[currentRoom]][myId] = 0;
        rooms[roomPath[currentRoom]].occupy = 0;

        if (scareDoor == 'left') { leftDisabled = 1 }
        else { rightDisabled = 1 }
        if (myId == 'f') { freddyInOffice = true }
        console.log(myName + ' inside office!');
    }

    var scare = function () {
        // the office animatronics only scare when the camera is down — the
        // camera overlay would cover the jumpscare
        if (!cameraMode) {
            console.log(myName + ' attacked!');
            doJumpscare(scareScreen);
        }
    }
    return { tick: tick };
}



//create a random number
function rnd(length) {
    return Math.floor((Math.random() * length) + 1);
}

// ===== Foxy game-loop adapter =====
// Calls the pure Foxy state machine (js/foxy.js) once per tick and applies
// its effects. All the stage/sprint rules live in the pure module; this is
// only the glue to the DOM (images, sounds, power).
function foxyTick() {
    if (gameEnd) { return; }
    var world = {
        viewingWestHall: cameraMode && _currentImgRoom == '2a',
        viewingCove: cameraMode && _currentImgRoom == '1c',
        leftDoorClosed: !!leftDoor,
        ghostHoldingLeft: doorGhostHolding('left'),
        night: night,
        rand: Math.random
    };
    var r = Foxy.tick(foxy, world);
    foxy = r.state;
    for (var i = 0; i < r.effects.length; i++) {
        var fx = r.effects[i];
        if (fx == 'sprint') {
            console.log('Foxy is sprinting!');
            // the West Hall camera shows the sprint animation while it is on
            // screen (updateCamImg re-renders the room on each camera switch)
            $('#foxy-run').get(0).currentTime = 0;
            playSafe($('#foxy-run'));
        }
        else if (fx == 'pound') {
            console.log('Foxy pounded the left door!');
            $('#foxy-run').get(0).pause();
            $('#foxy-pound').get(0).currentTime = 0;
            playSafe($('#foxy-pound'));
            // a blocked sprint costs real power — an instant hit, so it
            // bypasses the currentUsage/burnPower model on purpose
            power -= Foxy.POWER_DRAIN;
            if (power < 0) { power = 0; }
            $('#power-counter').html(power);
            // drain to zero: the power-out sequence takes over
            if (power == 0) { startPowerOut(); return; }
            // if the player is watching the West Hall, refresh the feed —
            // the hall is empty again (note: 2a uses .gif)
            if (cameraMode && _currentImgRoom == '2a') { updateCamImg(_currentImgPath, _currentImgRoom, 'gif'); }
        }
        else if (fx == 'jumpscare') {
            console.log('Foxy attacked!');
            foxyScare();
        }
        // 'advance' and 'reset' need no DOM work — the cove camera is static
    }
    // keep the sprint animation on the West Hall feed while it runs
    if (foxy.sprinting && cameraMode && _currentImgRoom == '2a') {
        $('#camera-bg1 img').attr('src', 'resources/img/rooms/2a_west_hall/foxy_run.gif');
    }
}

function foxyScare() {
    $('#foxy-run').get(0).pause();
    // the sprint can finish while the camera is up — hide the camera view so
    // the jumpscare is not covered by the overlay (same as the power-out)
    $('.camera-menu').removeClass('display-0, display-1').addClass('display-0');
    $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-0');
    doJumpscare('resources/img/rooms/safe_room/left_door_foxy_scare.gif');
}


function addNight() {
    $('.container:not(#start-screen)').addClass('animate-out');
    // change transition image
    $('.transition img').src('resources')
    // animate in transition screen


}


function powerOut() {

}

function playerWins() {

}

function muteCall() {
    $('#call'+night+'').get(0).pause();
    $('.mute-call').css('display', 'none');
}



//all door activity
//================
var doorTimeout;
function toggleLeftDoor() {
    if (!leftDisabled) {
        leftDoor ? leftDoor = 0 : leftDoor = 1;
        toggleDoor('left', leftDoor);
    } else if (leftDisabled) {
        $('.door-light-disabled').get(0).play();
    }
}

function toggleRightDoor() {
    if (!rightDisabled) {
        rightDoor ? rightDoor = 0 : rightDoor = 1;
        toggleDoor('right', rightDoor);
    } else if (rightDisabled) {
        $('.door-light-disabled').get(0).play();
    }
}

function toggleDoor(location, door) {
    updatePowerUsage();
    $('.door-sound').get(0).pause();
    $('.door-sound').get(0).currentTime = 0;
    $('.door-sound').get(0).play();
    $('.' + location + '-switch > img').attr('src', 'resources/img/rooms/' + location + '_switch_door_' + door + '_light_' + ((location=='right') ? rightLight : leftLight) + '.png');
    $('.' + location + '-door > img').attr('src', 'resources/img/doors/' + location + '_door_' + door + '.gif');
    //doorTimeout = setTimeout(function () {
    //    $('.' + location + '-door > img').attr('src', 'resources/img/doors/' + location + '_door_' + ((door) ? 0 : 1) + '.png');
    //}, 1000);
}



//all lights activity
//================
function toggleLeftLight() {
    $('#left-light-toggle').click(function () {
        if (!leftDisabled) {
            leftLight ? leftLight = 0 : leftLight = 1;
            processLightActivty(leftLight, 'left');
        } else if (leftDisabled) {
            $('.door-light-disabled').get(0).play();
        }
    });
}

function toggleRightLight() {
    $('#right-light-toggle').click(function () {
        if (!rightDisabled) {
            rightLight ? rightLight = 0 : rightLight = 1;
            processLightActivty(rightLight, 'right');
        } else if (rightDisabled) {
            $('.door-light-disabled').get(0).play();
        }
    });
}

function processLightActivty(state, pos) {
    if (!gameEnd) {
        if (pos == 'left') { $('.left-switch > img').attr('src', 'resources/img/rooms/left_switch_door_' + leftDoor + '_light_' + leftLight + '.png'); }
        else { $('.right-switch > img').attr('src', 'resources/img/rooms/right_switch_door_' + rightDoor + '_light_' + rightLight + '.png'); }

        updatePowerUsage();
        state ? $(".light-on").get(0).play() : $(".light-on").get(0).pause();

        if ((pos == 'left') && state && doorGhostHolding('left')) { $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_ghost_left_door_scare.png'); }
        else if ((pos == 'right') && state && doorGhostHolding('right')) { $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_ghost_right_door_scare.png'); }
        else if ((pos == 'left') && state && rooms['safe'].b) { $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_bonny_right_door_scare.png'); }
        else if ((pos == 'right') && state && rooms['safe'].c) { $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_chika_left_door_scare.png'); }
        else {
            $('.main-screen').attr('src', 'resources/img/rooms/safe_room/safe_room_left_light_' + leftLight + '_right_light_' + rightLight + '.png');
        }
    }
}



//all camera activity
//================
var camTimeout;
function cameraState() {
    console.log('Camera clicked!');
    // while a reboot is in progress the player is locked into the camera view
    // and cannot lower it until the reboot finishes (a broken-but-not-rebooting
    // camera can still be freely raised/lowered)
    if (_ghost.rebooting) return;
    // while the ghost sequence is active the camera is locked down: the player
    // cannot raise or lower it until the ghost is gone (lock lifts with _ghost.active)
    if (_ghost.active) return;
    clearTimeout(camTimeout);
    // count flips for the ghost "flipping too fast" trigger
    if (!_ghost.broken) { ghostRegisterToggle(); }
    cameraMode ? cameraDown() : cameraUp();
    updatePowerUsage();
    $('.camera-toggle').get(0).pause();
    $('.camera-toggle').get(0).currentTime = 0;
    $('.camera-toggle').get(0).play();
}

function cameraUp() {
    cameraMode = 1;
    $('#camera-bg2 img').attr('src', 'resources/img/cams/camera_mode_1.gif').toggleClass('display-1');
    camTimeout = setTimeout(function () {
        $('.camera-menu').removeClass('display-0, display-1').addClass('display-1');
        // if the camera is broken or mid-reboot, keep showing static (the reboot timer handles it)
        if (!_ghost.broken && !_ghost.rebooting) { updateCamImg(_currentImgPath, _currentImgRoom); }
        // the REPAIR button lives in the camera view: show it with the feed
        // (unless we're already on the Repair Screen, which covers the view)
        if (!_repairMode) { $('#camera-repair').removeClass('display-0').addClass('display-1'); }
        updateRebootUi();
        // the office fault indicator is only needed while the camera is down
        updateCamFaultIndicator();
        console.log('Cam up!');
        $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-0');
    }, 500);
}

function cameraDown() {
    cameraMode = 0;
    $('.camera-menu').removeClass('display-0, display-1').addClass('display-0');
    // the REPAIR button and the Repair Screen live in the camera view: hide them with the feed
    _repairMode = 0;
    $('#camera-repair').removeClass('display-1').addClass('display-0');
    $('#repair-screen').removeClass('display-1').addClass('display-0');
    // if the camera is broken, warn the player in the office that it needs fixing
    updateCamFaultIndicator();
    $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-1').attr('src', 'resources/img/cams/camera_mode_0.gif');
    camTimeout = setTimeout(function () {
        $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-0');
        console.log('Cam down!');
    }, 500);
}

// ===== Camera Repair Screen =====
// A full-screen view that replaces the camera view while the player repairs the
// camera. Entering it does NOT change cameraMode — the camera is still raised,
// so power usage and animatronic behaviour are unchanged.
function openRepairScreen() {
    if (!cameraMode) return; // only reachable from the camera view
    _repairMode = 1;
    // hide the camera-view REPAIR button (the Repair Screen covers the view)
    $('#camera-repair').removeClass('display-1').addClass('display-0');
    $('#repair-screen').removeClass('display-0').addClass('display-1');
    updateRebootUi();
    console.log('Repair screen open');
}

function closeRepairScreen() {
    // locked while a reboot runs; a completed reboot is fine to leave
    if (_ghost.rebooting) return;
    _repairMode = 0;
    _ghost.rebootDone = false; // leave the completed state behind
    $('#repair-screen').removeClass('display-1').addClass('display-0');
    // back to the camera view: show the REPAIR button again
    if (cameraMode) {
        $('#camera-repair').removeClass('display-0').addClass('display-1');
        updateCamImg(_currentImgPath, _currentImgRoom);
    }
    updateRebootUi();
    console.log('Repair screen closed');
}

// ===== Ghost flicker system =====
// Runs once per game tick (100ms) while the game is active.
function ghostTick() {
    _ghostTick++;
    var g = _ghost;

    if (g.active) return; // already mid-sequence

    // handle an in-progress reboot
    if (g.rebooting) { ghostRebootTick(); return; }

    // count down the 2s lockout before REBOOT can be pressed
    if (g.broken && g.lockTicks > 0) {
        g.lockTicks--;
        updateRebootUi();
        return;
    }

    // cooldown after a previous scare
    if (g.cooldown > 0) { g.cooldown--; return; }

    // count how long the camera has been up continuously
    if (cameraMode) { g.camUpTicks++; } else { g.camUpTicks = 0; }

    // record toggle times and drop anything older than the window
    var cutoff = _ghostTick - _ghostRapidWindow;
    while (g.toggleTimes.length && g.toggleTimes[0] < cutoff) { g.toggleTimes.shift(); }

    // trigger if watched too long OR flipped too rapidly
    if (g.camUpTicks >= _ghostLongTicks || g.toggleTimes.length >= _ghostRapidCount) {
        console.log('Ghost triggered!');
        startGhostSequence();
    }
}

// Record a camera raise/lower flip (called from cameraState).
function ghostRegisterToggle() {
    _ghost.toggleTimes.push(_ghostTick);
}

// ===== Door Ghost system =====
// Runs once per game tick (100ms) while the game is active.
function doorGhostTick() {
    var d = _doorGhost;

    // detect animatronics leaving the safe room -> start that door's 15s wait
    if (d.prevSafeB && !rooms['safe'].b) { d.leftWait = _doorGhostPostAnimTicks; }
    if (d.prevSafeC && !rooms['safe'].c) { d.rightWait = _doorGhostPostAnimTicks; }
    d.prevSafeB = rooms['safe'].b;
    d.prevSafeC = rooms['safe'].c;

    if (d.leftWait > 0) { d.leftWait--; }
    if (d.rightWait > 0) { d.rightWait--; }

    if (d.door) {
        // the matching light held on continuously drives the ghost away
        var lightOn = (d.door == 'left') ? leftLight : rightLight;
        if (lightOn) { d.holdTicks++; } else { d.holdTicks = 0; }

        if (d.holdTicks >= _doorGhostHoldTicks) {
            var goneDoor = d.door;
            console.log('Door Ghost driven away from the ' + goneDoor + ' door');
            d.door = null;
            d.atDoorTicks = 0;
            d.holdTicks = 0;
            d.spawnIn = rndRange(_nightDiff.ghostNext[0], _nightDiff.ghostNext[1]);
            // the ghost is gone: refresh the office view (the light may still be on)
            processLightActivty((goneDoor == 'left') ? leftLight : rightLight, goneDoor);
            return;
        }

        d.atDoorTicks++;
        if (d.atDoorTicks >= _doorGhostAtDoorTicks) {
            console.log('Door Ghost leapt into the office!');
            d.door = null;
            d.atDoorTicks = 0;
            d.holdTicks = 0;
            d.cooldown = _doorGhostCooldownTicks;
            // same consequence as the camera-abuse Ghost: the existing sequence
            // (guard: don't re-trigger it if the camera-abuse Ghost is already running)
            if (!_ghost.active) { startGhostSequence(); }
        }
        return;
    }

    // not at a door: count down the cooldown, then the spawn interval
    if (d.cooldown > 0) { d.cooldown--; return; }

    // never appear while the existing Ghost sequence is running, the camera is
    // broken, or a reboot is in progress (the game-ended flag already keeps
    // this off during the power-out sequence and after 6 AM)
    if (_ghost.active || _ghost.broken || _ghost.rebooting) return;

    if (d.spawnIn > 0) { d.spawnIn--; return; }

    // roll a door: 50/50, try the other door if the first is not free
    var first = (rnd(2) == 1) ? 'left' : 'right';
    var second = (first == 'left') ? 'right' : 'left';
    var door = doorGhostDoorFree(first) ? first : (doorGhostDoorFree(second) ? second : null);
    if (!door) {
        // neither door is free: cancel this appearance and roll a fresh interval
        d.spawnIn = rndRange(_nightDiff.ghostNext[0], _nightDiff.ghostNext[1]);
        return;
    }
    d.door = door;
    d.atDoorTicks = 0;
    d.holdTicks = 0;
    // if the light is already on, show the ghost right away (otherwise the
    // player would never see it, yet the drive-away hold would still count)
    if (door == 'left' ? leftLight : rightLight) { processLightActivty(door == 'left' ? leftLight : rightLight, door); }
    console.log('Door Ghost appeared at the ' + door + ' door');
}

// A door is free for the Door Ghost when no animatronic is at it and its
// post-animatronic wait has expired.
function doorGhostDoorFree(door) {
    var d = _doorGhost;
    if (door == 'left') { return !rooms['safe'].b && d.leftWait <= 0; }
    return !rooms['safe'].c && d.rightWait <= 0;
}

// True while the Door Ghost is holding the given door (used to block an
// animatronic's attack at that door).
function doorGhostHolding(door) {
    return _doorGhost.door == door;
}

function startGhostSequence() {
    var g = _ghost;
    g.active = true;
    g.camUpTicks = 0;
    g.toggleTimes = [];

    // Ghost Speed Boost: being hit makes the animatronics move 2x faster until
    // the ghost is gone. Fixed value, so repeated hits never stack.
    _moveSpeedMult = 2;

    // force the camera down the moment the flicker starts: the scare is a full
    // interruption and the camera stays locked down until the ghost is gone
    clearTimeout(camTimeout); // cancel a pending camera raise/lower transition
    if (cameraMode) { cameraDown(); }

    // 1) faint full-screen flicker of the two secret images
    $('#ghost-overlay').addClass('display-1').removeClass('ghost-flash');
    playSafe($('#ghost-sound')); // ghost sound starts with the image, loops until the overlay hides
    var flicker = function () {
        var img = (rnd(2) == 1)
            ? 'resources/img/rooms/secret/game1.png'
            : 'resources/img/rooms/secret/gam2.png';
        $('#ghost-overlay img').attr('src', img);
    };
    flicker();
    _ghostFlickerTimer = setInterval(flicker, 120);

    // 2) after the flicker, a brief full flash (the ghost is seen clearly)
    setTimeout(function () {
        clearInterval(_ghostFlickerTimer);
        $('#ghost-overlay img').attr('src', 'resources/img/rooms/secret/gam2.png');
        $('#ghost-overlay').addClass('ghost-flash');

        // hold the flash briefly, then fade the ghost out (no slide-down):
        // dropping ghost-flash + display-1 restores the base opacity transition,
        // so the overlay fades 1 -> 0 before it is hidden
        setTimeout(function () {
            $('#ghost-overlay').removeClass('ghost-flash display-1');
            setTimeout(function () {
                $('#ghost-overlay').addClass('display-0');
                $('#ghost-sound').get(0).pause();
                // the ghost is gone: the camera lock lifts and the Ghost Speed
                // Boost ends (breakCamera already left the camera broken)
                g.active = false;
                _moveSpeedMult = 1;
            }, _ghostFadeMs);
        }, _ghostFlashHoldMs);

        // 3) shock: heavy breathing + screen blur + blink (starts ~1s after the hit)
        setTimeout(function () {
            playSafe($('#ghost-breath'));
            $('.container').addClass('ghost-shock-screen');
            setTimeout(function () {
                $('.container').removeClass('ghost-shock-screen');
                $('#ghost-breath').get(0).pause();
            }, 4500);
        }, 1000);

        // 4) camera breaks: show static, require the player to raise the camera and reboot
        breakCamera();
    }, _ghostFlickerMs);
}

function breakCamera() {
    var g = _ghost;
    g.broken = true;
    g.lockTicks = _ghostRebootLockTicks; // 2s after the fault before REBOOT can be pressed

    // the camera was already forced down when the flicker started (and is locked
    // down while the ghost is on screen), so just leave it broken: static feed
    // in the office, a fault indicator while the camera is down, and the
    // flickering broken feed once the player raises it
    $('#camera-bg1 img').attr('src', 'resources/img/game/static.gif');
    updateCamFaultIndicator();

    startBrokenFeed();
}

// While the camera is unusable (broken or mid-reboot) the feed flickers.
// A broken camera also flickers in the secret image; a proactive reboot
// shows plain static.
function startBrokenFeed() {
    clearInterval(_brokenCamTimer);
    _brokenCamTimer = setInterval(function () {
        if (!(_ghost.broken || _ghost.rebooting)) return;
        if (cameraMode) {
            var img = 'resources/img/game/static.gif';
            if (_ghost.broken && rnd(2) == 1) {
                img = 'resources/img/rooms/secret/gam2.png';
            }
            $('#camera-bg1 img').attr('src', img);
        }
    }, 150);
}

// Update the Repair Screen for its current state: the "REPAIR CAMERA" title
// control, the state area below it, the ERROR indicator, and the BACK control.
//   idle      -> state area empty; title pressable (works even on a healthy camera)
//   locked    -> state area "REPAIR IN n..." (2s after a fault; title not pressable)
//   rebooting -> state area terminal animation; title + BACK disabled (locked in)
//   done      -> state area "COMPLETE"; title disabled; BACK re-enabled
function updateRebootUi() {
    var g = _ghost;
    var $title = $('#repair-camera');
    var $back = $('#repair-back button');

    // resolve the current state into the state-area content and button states
    var stateHtml, titleDisabled, backDisabled;
    if (g.rebooting) {
        // terminal-style animation: a spinning cursor + "REPAIRING...". The
        // frame is derived from the reboot tick count, so the existing per-tick
        // loop drives it (no new timer) and it gives no sense of progress.
        var frames = ['|', '/', '-', '\\'];
        stateHtml = frames[g.rebootTicks % 4] + ' REPAIRING...';
        titleDisabled = true;
        backDisabled = true; // locked on the Repair Screen while the reboot runs
    } else if (g.lockTicks > 0) {
        stateHtml = 'REPAIR IN ' + Math.ceil(g.lockTicks / 10) + '...'; // 20 ticks = 2s
        titleDisabled = true;
        backDisabled = false;
    } else if (g.rebootDone) {
        stateHtml = 'COMPLETE';
        titleDisabled = true;
        backDisabled = false;
    } else {
        stateHtml = ''; // healthy, not repairing: keep the state area empty
        titleDisabled = false;
        backDisabled = false;
    }

    $('#repair-state').html(stateHtml);
    setRepairBtn($title, titleDisabled);
    setRepairBtn($back, backDisabled);

    // the ERROR indicator is visible exactly while the camera is in a fault
    // (broken stays true through a reactive reboot, clearing at completion)
    if (g.broken) {
        $('#repair-error').removeClass('display-0').addClass('display-1');
    } else {
        $('#repair-error').removeClass('display-1').addClass('display-0');
    }
}

// enable/disable a Repair Screen control
function setRepairBtn($btn, disabled) {
    if (disabled) {
        $btn.attr('disabled', 'disabled').css('cursor', 'not-allowed').css('opacity', '0.5');
    } else {
        $btn.removeAttr('disabled').css('cursor', 'pointer').css('opacity', '1');
    }
}

// While the camera is broken but the player has it DOWN (in the office), the
// REBOOT button is hidden (it lives in the camera view). Show a small fault
// indicator in the office so the player knows the camera needs fixing.
function updateCamFaultIndicator() {
    if (_ghost.broken && !cameraMode) {
        $('#cam-fault-indicator').removeClass('display-0').addClass('display-1');
    } else {
        $('#cam-fault-indicator').removeClass('display-1').addClass('display-0');
    }
}

function ghostReboot() {
    var g = _ghost;
    // can't reboot while one is in progress, or while the 2s post-fault lockout runs
    if (g.rebooting || g.lockTicks > 0) return;
    g.rebooting = true;
    g.rebootTicks = 0;
    g.rebootDone = false;
    // remember whether this was a reactive reboot (camera was broken) — only
    // those put the ghost on cooldown; a proactive reboot on a healthy camera
    // just costs the few seconds of unusable camera
    g.rebootWasBroken = g.broken;
    // the feed goes to static for the duration of the reboot (even on a healthy camera)
    if (cameraMode) {
        $('#camera-bg1 img').attr('src', 'resources/img/game/static.gif');
        startBrokenFeed();
    }
    updateRebootUi();
    console.log('Rebooting camera...');
}

// called from ghostTick while rebooting
function ghostRebootTick() {
    var g = _ghost;
    if (!g.rebooting) return;
    g.rebootTicks++;
    updateRebootUi(); // advance the terminal animation each tick
    if (g.rebootTicks >= _ghostRebootTicks) {
        g.rebooting = false;
        g.broken = false;
        g.active = false;
        g.rebootDone = true; // the Repair Screen shows a completed state until BACK is pressed
        // only a reactive reboot (camera was broken) puts the ghost on cooldown
        // and ends the Ghost Speed Boost (the danger window is over)
        if (g.rebootWasBroken) { g.cooldown = _ghostCooldownTicks; _moveSpeedMult = 1; }
        g.rebootWasBroken = false;
        clearInterval(_brokenCamTimer);
        // restore the camera feed (behind the Repair Screen; visible once BACK is pressed)
        if (cameraMode) { updateCamImg(_currentImgPath, _currentImgRoom); }
        updateRebootUi();
        updateCamFaultIndicator();
        console.log('Camera rebooted!');
    }
}



function transitionScreen(night) {
    if (night < 2) {
        $('.container:not(#start-screen)').addClass('animate-out');

        setTimeout(function() {
            $('.preloader').addClass('animate-out');
            $('.transition').addClass('animate-in');
        }, 14900);

        setTimeout(function() {
            $('.transition').removeClass('animate-out');
            $('.transition img').attr('src', 'resources/img/game/transition-fade.gif');
            $('.transition h2').toggleClass('display-1');
            $('.transition #night-count').html(night);
            playSafe($('.camera-cycle'));
        }, 20000);

        setTimeout(function() {
            $('.transition').addClass('animate-out');
        }, 24000);

        setTimeout(function() {
            $('.preloader').css('display', 'none');
            $('.container:not(#start-screen)').css('opacity', '1');
            $('.transition').css('display', 'none');
            gamestart();
        }, 24900);

    } else {
        $('.preloader').css('display', 'none');
        $('.transition').css('display', 'none');
        $('.container:not(#start-screen)').css('opacity', '1');
        $('.transition').css('display', 'none');
        gamestart();

    }

    activeCamImg = 'resources/img/rooms/1a_show_stage/cam_1a_b'+showStage[0]+'_c'+showStage[0]+'_f'+showStage[0]+'.png';

}

function updateCamImg(path, room, filetype) {
    _currentImgPath = (typeof path == 'undefined' ? _currentImgPath : path);
    _currentImgRoom = (typeof path == 'undefined' ? _currentImgRoom : room);
    var extension = (typeof filetype == 'undefined' ? 'png' : filetype);
    if (room == '6') {
        $('#camera-bg1 img').attr('src', _currentImgPath);
        //check sounds
        if (rooms['6'].b) { $('#kitchen-b').get(0).play(); }
        else if (rooms['6'].c) { $('#kitchen-c').get(0).play(); }
        else if (rooms['6'].f) { $('#kitchen-f').get(0).play(); }
    }
    else {
        // Freddy artwork (_f1) only exists for the Show Stage and Backstage;
        // the other rooms fall back to the _f0 image so Freddy's presence
        // never 404s a camera feed
        var f = rooms[_currentImgRoom].f;
        if (f && _currentImgRoom != '1a' && _currentImgRoom != '5') { f = 0; }
        $('#camera-bg1 img').attr('src', _currentImgPath + 'b' + rooms[_currentImgRoom].b + '_c' + rooms[_currentImgRoom].c + '_f' + f + '.' + extension);
        //check sounds
        $('#kitchen-b').get(0).pause();
        $('#kitchen-c').get(0).pause();
        $('#kitchen-f').get(0).pause();
    }
}

function cameraToggle(ele) {
    $('#camera-id').html($(ele).data('camname'));
    $('.camera-menu ul li').removeClass('active');
    $(ele).parent().toggleClass('active');
    $('.camera-cycle').get(0).play();
}

function playRandomSound() {
    // play random sounds at random 1 night

}

function restart() {
    $("#game-start").get(0).pause();
    $("#ambience2").get(0).pause();
    // setTimeout(function() {
    //     $('.main-screen').addClass('animate-out');
    // }, 4000);
    ++timesPlayed;
    console.log(timesPlayed);
    localStorage.setItem('night', String(night));
    localStorage.removeItem('timesPlayed');
    localStorage.setItem('timesPlayed', String(timesPlayed));

    setTimeout(function() {
        $('.main-screen').attr('src', 'resources/img/game/bonnie_gameover.png');
        $('.main-screen').addClass('animate-in');
    }, 4500);
    setTimeout(function() {
        $('.main-screen').addClass('animate-out');
    }, 9500);
    setTimeout(function() {
        $(location).attr('href', 'index.html');
    }, 13500);

    return;
}

// The End: shown after surviving Night 5 (or when a saved night is already
// beyond 5). Black screen + "THE END" + Play Again, which resets the save to
// Night 1 and returns to the start screen. The win sounds are played by the
// caller (burnTime already plays them on a Night-5 win; the startup guard
// plays them when loading an already-complete save).
function showTheEnd() {
    gameEnd = true;
    $('.to-hide').css('display', 'none');
    $('.camera-menu').removeClass('display-0, display-1').addClass('display-0');
    $('#camera-bg2 img').removeClass('display-0, display-1').addClass('display-0');
    $('.main-screen').attr('src', 'resources/img/game/5_to_6.gif');
    $('#the-end').removeClass('display-0').addClass('display-1');
}

// Play Again: reset the save to Night 1 and return to the start screen.
function playAgain() {
    localStorage.setItem('night', '1');
    location.href = 'index.html';
}

$('document').ready(function() {
    console.log('DOM is loaded...');

    // Never let a game image be picked up and dragged (CSS also blocks this;
    // this is the JS backstop).
    $(document).on('dragstart', function (e) { e.preventDefault(); });

    // A saved night beyond 5 means the game is already complete: show The End
    // instead of starting a phantom Night 6. We skip transitionScreen() (which
    // would start a phantom Night 6), so hide the preloader/transition and
    // reveal the container here — they are normally hidden by transitionScreen.
    if (night > 5) {
        reset();
        $('.preloader').css('display', 'none');
        $('.transition').css('display', 'none');
        $('.container:not(#start-screen)').css('opacity', '1');
        showTheEnd();
        playSafe($('#win-sound'));
        setTimeout(function () { playSafe($('#win-cheer')); }, 2000);
        return;
    }

    reset();
    // show which night and game start
    transitionScreen(night);

    $('#cam1a').click(function () {
        updateCamImg('resources/img/rooms/1a_show_stage/cam_1a_', '1a');
        cameraToggle(this);
    }),

    $('#cam1b').click(function () {
        updateCamImg('resources/img/rooms/1b_dining_area/1b_', '1b');
        cameraToggle(this);
    }),
    $('#cam1c').click(function () {
        // track the cove as the current room so the game knows the player is
        // viewing it (viewing the cove freezes Foxy's random creep); the feed
        // itself is a single static image
        _currentImgPath = 'resources/img/rooms/1c_pirate_cove/1c_';
        _currentImgRoom = '1c';
        activeCamImg = 'resources/img/rooms/1c_pirate_cove/1c_b0_c0_f0.png';
        $('#camera-bg1 img').attr('src', activeCamImg);
        cameraToggle(this);
    }),
    $('#cam2a').click(function () {
        updateCamImg('resources/img/rooms/2a_west_hall/2a_', '2a', 'gif');
        cameraToggle(this);
    }),
    $('#cam2b').click(function () {
        updateCamImg('resources/img/rooms/2b_west_hall_corner/2b_', '2b');
        cameraToggle(this);
    }),
    $('#cam3').click(function () {
        updateCamImg('resources/img/rooms/3_supply_closet/3_', '3');
        cameraToggle(this);
    }),
    $('#cam4a').click(function () {
        updateCamImg('resources/img/rooms/4a_east_hall/4a_', '4a');
        cameraToggle(this);
    }),
    $('#cam4b').click(function () {
        updateCamImg('resources/img/rooms/4b_east_hall_corner/4b_', '4b');
        cameraToggle(this);
    }),
    $('#cam5').click(function () {
        updateCamImg('resources/img/rooms/5_backstage/5_', '5');
        cameraToggle(this);
    }),
    $('#cam6').click(function () {
        updateCamImg('resources/img/rooms/6_kitchen/6_b0_c0_f0.png', '6');
        cameraToggle(this);
    }),
    $('#cam7').click(function () {
        updateCamImg('resources/img/rooms/7_restroom/7_', '7');
        cameraToggle(this);
    }),

    // the REPAIR button in the camera view opens the Repair Screen
    $('#camera-repair button').click(function () {
        openRepairScreen();
    }),

    // the "REPAIR CAMERA" title on the Repair Screen starts a reboot (guarded inside ghostReboot)
    $('#repair-camera').click(function () {
        ghostReboot();
    }),

    // BACK on the Repair Screen (guarded inside closeRepairScreen)
    $('#repair-back button').click(function () {
        closeRepairScreen();
    })

    //init door
    //motioLeftDoor = new Motio($('.left-door')[0], {
    //    fps: 29,
    //    frames: 14,
    //    vertical: true
    //});

});
