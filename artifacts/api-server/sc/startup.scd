// Atmosphere Storytelling System - SuperCollider Startup
// This script boots scsynth and loads all SynthDefs

(
var scDir = thisProcess.nowExecutingPath.dirname;

s = Server.local;

// Configure server for headless Raspberry Pi operation
// numInputBusChannels = 2 to receive voice from the ALSA loopback device
Server.default.options.numInputBusChannels = 2;
Server.default.options.numOutputBusChannels = 2;
Server.default.options.maxNodes = 512;
Server.default.options.maxSynthDefs = 256;
Server.default.options.memSize = 65536;
Server.default.options.sampleRate = 44100;
Server.default.options.blockSize = 512;

// Use system default ALSA device on Linux (Raspberry Pi)
if (thisProcess.platform == \linux, {
    Server.default.options.device = nil;
});

ServerQuit.add({
    "SuperCollider server quit".postln;
});

// waitForBoot runs its function inside a Routine, so s.sync is valid here
s.waitForBoot({
    "SuperCollider server booted".postln;

    // Master limiter — sits at the tail of the root node so it processes the
    // summed output of every other synth before it reaches the DAC.
    // Ceiling: 0.7 ≈ -3 dBFS; lookahead: 10 ms.
    SynthDef(\master_limiter, {
        var ceiling = 0.7;
        var lookahead = 0.01;
        var in = In.ar(0, Server.default.options.numOutputBusChannels);
        var limited = Limiter.ar(in, ceiling, lookahead);
        ReplaceOut.ar(0, limited);
    }).add;

    // Load SynthDef files — each calls SynthDef(\name, { ... }).add
    (scDir +/+ "envThemes.scd").load;
    (scDir +/+ "attributes.scd").load;
    (scDir +/+ "voice.scd").load;

    // s.sync waits until the server has acknowledged all pending SynthDef.add messages
    s.sync;

    // Start the master limiter at the tail of the root node so it runs after
    // every other synth in the default group.
    Synth(\master_limiter, [], RootNode(s), \addToTail);
    "Master limiter started".postln;

    "SynthDefs loaded".postln;
    "SuperCollider ready".postln;
});
)
