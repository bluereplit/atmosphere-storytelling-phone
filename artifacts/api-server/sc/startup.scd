// Atmosphere Storytelling System - SuperCollider Startup
// This script boots scsynth and loads all SynthDefs

(
var scDir = thisProcess.nowExecutingPath.dirname;

s = Server.local;

// Configure server for headless Raspberry Pi operation
Server.default.options.numInputBusChannels = 0;
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

    // Load SynthDef files — each calls SynthDef(\name, { ... }).add
    (scDir +/+ "envThemes.scd").load;
    (scDir +/+ "attributes.scd").load;

    // s.sync waits until the server has acknowledged all pending SynthDef.add messages
    s.sync;

    "SynthDefs loaded".postln;
    "SuperCollider ready".postln;
});
)
