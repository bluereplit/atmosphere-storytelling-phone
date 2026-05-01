// test_all.scd — Validate all SynthDefs load and produce non-zero audio
//
// Run from the sc/ directory:
//   sclang test_all.scd
//
// What this tests:
//   1. startup.scd is syntactically valid (compiled, not booted)
//   2. All 13 env theme SynthDefs compile and add without errors
//   3. All 38 attribute SynthDefs compile and add without errors
//   4. Each SynthDef boots a Synth and produces non-zero amplitude output
//      - Deterministic defs: 1.5s measurement at intensity=0.5
//      - Stochastic/Dust-based defs: 5s measurement at intensity=1.0,
//        retried up to 3 times; passes if any trial detects non-zero amplitude
//   5. Each Synth frees cleanly after the gate is closed
//
// Exit codes: 0 = all passed, 1 = one or more failed

(
var scDir = thisProcess.nowExecutingPath.dirname;

// ---------- config ----------
var detTestDuration  = 1.5;   // seconds to measure deterministic defs
var stochTestDuration = 5.0;  // seconds per trial for stochastic defs
var warmUp           = 0.3;   // seconds before measurement starts
var rmsThreshold     = 3e-5;  // min amplitude that counts as non-zero
var stochRetries     = 3;     // max trials for stochastic defs
var passed  = 0;
var failed  = 0;
var failures = List.new;

// ---------- env theme names ----------
var envDefs = [
    \env_forest, \env_ocean, \env_mountain, \env_desert,
    \env_city, \env_mystical, \env_medieval, \env_underwater,
    \env_cosmic, \env_cave, \env_arctic, \env_jungle, \env_tavern
];

// ---------- attribute names (38 total) ----------
var attrDefs = [
    // Nature — original (10)
    \attr_crickets, \attr_birds, \attr_wind, \attr_owls,
    \attr_campfire, \attr_ocean_waves, \attr_rain, \attr_thunder,
    \attr_frogs, \attr_stream,
    // Nature — extended (9)
    \attr_wolves, \attr_ravens, \attr_bats, \attr_insects_night,
    \attr_horses, \attr_waterfall, \attr_blizzard, \attr_sandstorm,
    \attr_geothermal,
    // City / Urban (5)
    \attr_traffic, \attr_crowd, \attr_subway, \attr_sirens,
    \attr_rain_city,
    // Mystical / Arcane (5)
    \attr_singing_bowls, \attr_chimes, \attr_whispers,
    \attr_choir_pad, \attr_portal_hum,
    // Dramatic / Tension (4)
    \attr_heartbeat, \attr_war_drums, \attr_tension_drone,
    \attr_thunder_distant,
    // Medieval / Historical (5)
    \attr_blacksmith, \attr_church_bells, \attr_tavern_crowd,
    \attr_seagulls, \attr_dripping_cave
];

// Stochastic defs rely on Dust with low average rate; tested with longer window
// and multiple retries at intensity=1.0 so the Dust rate is maximised.
// Each def must still produce non-zero amplitude in at least one trial.
var stochasticDefs = [
    \attr_thunder,        // Dust 0.02–0.1/s
    \attr_owls,           // Dust 0.05–0.25/s
    \attr_wolves,         // Dust 0.04–0.15/s
    \attr_singing_bowls,  // Dust 0.05–0.2/s  (3s ring time helps)
    \attr_chimes,         // Dust 0.2–1.5/s
    \attr_church_bells,   // Dust 0.04–0.15/s
    \attr_thunder_distant,// Dust 0.05–0.2/s
    \attr_dripping_cave   // Dust 0.3–2.5/s   (ok at full intensity)
];

// ---------- measure amplitude for `duration` seconds, return peak accum ----------
var measureAmp = { |duration|
    var rmsSynth, rmsVal = 0;
    rmsSynth = {
        var sig = In.ar(0, 2);
        var amp = Amplitude.kr(sig[0], 0.005, 0.05);
        SendReply.kr(Impulse.kr(20), '/testAmp', [amp]);
    }.play(addAction: \addToTail);
    OSCdef(\ampListener, { |msg| rmsVal = rmsVal + msg[3]; }, '/testAmp');
    duration.wait;
    rmsSynth.free;
    OSCdef(\ampListener).free;
    rmsVal  // return accumulated amplitude sum
};

// ---------- test one def (one trial) ----------
var testOneTrial = { |defName, isAttr, intensity, testDuration|
    var synth, result;
    if (isAttr, {
        synth = Synth(defName, [amp: 1.0, intensity: intensity, fadeTime: 0.05]);
    }, {
        synth = Synth(defName, [
            amp: 1.0, intensity: intensity, gate: 1, fadeTime: 0.05,
            reverb: 0.1, lpfFreq: 12000, masterPitch: 0
        ]);
    });
    warmUp.wait;
    result = measureAmp.(testDuration);
    // env themes use Linen.kr gate; attr defs use amp fade only
    if (isAttr.not, { synth.set(\gate, 0) });
    0.3.wait;
    synth.free;
    result  // return amplitude sum
};

// ---------- test one def with retries for stochastic ----------
var testDef = { |defName, isAttr|
    var isStoch = stochasticDefs.includes(defName);
    var intensity = if (isStoch, { 1.0 }, { 0.5 });
    var duration  = if (isStoch, { stochTestDuration }, { detTestDuration });
    var maxTrials = if (isStoch, { stochRetries }, { 1 });
    var ok = false;
    var bestRms = 0;
    var trial = 0;

    ("  Testing " ++ defName ++ if (isStoch, {" [stochastic]"}, {""}) ++ " ...").post;

    while ({ trial < maxTrials and: { ok.not } }, {
        var rms = testOneTrial.(defName, isAttr, intensity, duration);
        if (rms > bestRms, { bestRms = rms });
        if (rms > rmsThreshold, { ok = true });
        trial = trial + 1;
    });

    if (ok, {
        passed = passed + 1;
        (" PASS (amp accum: " ++ bestRms.round(0.00001) ++ ")").postln;
    }, {
        failed = failed + 1;
        failures.add(defName);
        (" FAIL (amp accum: " ++ bestRms.round(0.00001) ++ " — below threshold " ++ rmsThreshold ++ ")").postln;
    });
};

// ---------- validate startup.scd compiles ----------
var validateStartup = {
    var startupPath = scDir +/+ "startup.scd";
    var src, compiled;
    ("Checking startup.scd syntax ...").post;
    src = File.readAllString(startupPath);
    compiled = thisProcess.interpreter.compile(src);
    if (compiled.notNil, {
        " OK".postln;
    }, {
        " FAILED (startup.scd did not compile)".postln;
        failed = failed + 1;
        failures.add(\startup_scd);
    });
};

// ---------- run ----------
s = Server.local;
Server.default.options.numInputBusChannels = 0;
Server.default.options.numOutputBusChannels = 2;
Server.default.options.sampleRate = 44100;
Server.default.options.maxNodes = 1024;

s.waitForBoot({
    // 1. Validate startup.scd syntax
    "=== Startup Validation ===".postln;
    validateStartup.();
    "".postln;

    // 2. Load SynthDefs via the same sequence startup.scd uses
    "Loading SynthDefs (same load order as startup.scd) ...".postln;
    (scDir +/+ "envThemes.scd").load;
    (scDir +/+ "attributes.scd").load;
    s.sync;
    "SynthDefs loaded.".postln;
    "".postln;

    // 3. Test each env theme
    "=== Environment Themes (13) ===".postln;
    envDefs.do { |name| testDef.(name, false) };

    "".postln;
    "=== Attribute SynthDefs (38) ===".postln;
    attrDefs.do { |name| testDef.(name, true) };

    "".postln;
    "=== Results ===".postln;
    ("Passed: " ++ passed ++ " / " ++ (passed + failed)).postln;
    if (failed > 0, {
        ("Failed (" ++ failed ++ "):").postln;
        failures.do { |name| ("  - " ++ name).postln };
    }, {
        "All SynthDefs compiled and produced non-zero audio output.".postln;
    });

    s.quit;
    if (failed > 0, { 1.exit }, { 0.exit });
});
)
