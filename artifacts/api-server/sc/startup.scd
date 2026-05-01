// Atmosphere Storytelling System - SuperCollider Startup
// This script boots scsynth and loads all SynthDefs

(
var startupTime = Date.localtime;

s = Server.local;

// Configure server for headless Raspberry Pi operation
Server.default.options.numInputBusChannels = 0;
Server.default.options.numOutputBusChannels = 2;
Server.default.options.maxNodes = 512;
Server.default.options.maxSynthDefs = 256;
Server.default.options.memSize = 65536;
Server.default.options.sampleRate = 44100;
Server.default.options.blockSize = 512;

// Use ALSA on Linux (Raspberry Pi)
if (thisProcess.platform == \linux, {
    Server.default.options.device = (
        Platform.case(\linux, {
            // Try to use the default ALSA device
            nil // nil = use system default
        })
    );
});

ServerBoot.add({
    "SuperCollider server booted".postln;

    // Load all SynthDefs
    thisProcess.nowExecutingPath.dirname +/+ "envThemes.scd" => load;
    thisProcess.nowExecutingPath.dirname +/+ "attributes.scd" => load;

    // Signal to Node.js that we are ready
    1.wait;
    "SynthDefs loaded".postln;
    "SuperCollider ready".postln;
});

ServerQuit.add({
    "SuperCollider server quit".postln;
});

s.waitForBoot({
    "Server booted successfully".postln;
});
)
